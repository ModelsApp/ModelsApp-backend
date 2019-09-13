let viewModels = require('../../model/campaign/campaignViewModel');
let moment = require('moment');
let imageUplader = require('../../lib/imageUplader');
let multiparty = require('multiparty');
let middleware = require('../../config/authMiddleware');
let pushProvider = require('../../lib/pushProvider');

//userCampaig statuses
//0 - waiting for confirmation
//1 - accepted
//-1 - rejected
//2 - waiting for review
//3 - under review
//4 - photo approved
//-2 - photo rejected

module.exports = (app, Campaign, UserCampaign, User, entityHelper) => {
  
    app.post('/api/campaign', middleware.isAuthorized,  async (req, res) => {
      let qrCode = req.body.qrCode;
      let user = await req.user;
      if(qrCode && user){
        let campaign = await Campaign.findOne({qrCode: qrCode});
        if(campaign){
          let userCampaign = await UserCampaign.findOne({ user: user._id, campaign: campaign._id, isPending: false, isAccepted : true});
          if(userCampaign){
            if(!userCampaign.isGiftTaken){
              await UserCampaign.findOneAndUpdate({user: user._id, campaign: campaign._id}, {$set: {isGiftTaken: true }});
              userCampaign = await UserCampaign.findOne({user: user._id, campaign: campaign._id});

              let campaigns = await Campaign.find({}).toArray();
              campaign = viewModels.toMobileViewModel(campaigns, user, true).filter(x => x._id == campaign._id)[0];

              res.status(200).json(await viewModels.joinCampaignWithUserCampaign(campaign, userCampaign));
            }else{
              res.status(400).json({message : "you arleady taked the gift"});
            }
          }else{
            res.status(400).json({message : "you cannot take a gift"});
          }
        }else{
          res.status(404).json({message : "campaign not found"});
        }
      }else{
        res.status(404).json({message : "invalid parameters"});
      }
    });

    //create new user campaing
    app.post('/api/campaign/:id/join', middleware.isAuthorized,  async (req, res) => {
        let user = await req.user;
        let id = parseInt(req.params.id);
        if(user && id){
            let campaign = await Campaign.findOne({_id: id});
            if(campaign){
                if(campaign.users.filter(x => x == user._id).length == 0){
                  if(moment().isBefore(moment(campaign.startAt))){
                    let imageCount = 0;
                    if(campaign.tasks.filter(x => x.type == 'photo').length == 1){
                        imageCount = campaign.tasks.find(x => x.type == 'photo').count;
                    }
                    let userCampaign = {
                        _id: await entityHelper.getNewId('userCampaignId'),
                        user: user._id,
                        campaign: campaign._id,
                        isAccepted: false,
                        isPending: true,
                        isGiftTaken: false,
                        uploadPicturesTo: campaign.uploadPicturesTo,
                        uploadPicturesInstagramTo: campaign.uploadPicturesInstagramTo,
                        imageCount: imageCount,
                        status: 0,
                        location: {},
                        slot: {},
                        images: []
                    }
                    await UserCampaign.insertOne(userCampaign);
                    await Campaign.findOneAndUpdate({_id : campaign._id},{ $push: { users: user._id }});
                    
                    let campaigns = await Campaign.find({}).toArray();
                    campaign = viewModels.toMobileViewModel(campaigns, user, true).filter(x => x._id == id)[0];

                    res.status(200).json(await viewModels.joinCampaignWithUserCampaign(campaign, userCampaign));
                  }else{
                    res.status(404).json({message : "campain arleady started"});
                }
                }else{
                    res.status(404).json({message : "you are arleady joinded"});
                }
            }else{
                res.status(404).json({message : "campaign not found"});
            }
        }else{
            res.status(404).json({message : "invalid parameters"});
        }
    });

    app.post('/api/campaign/:id/review', middleware.isAuthorized,  async (req, res) => {
      let user = await req.user;
      let id = parseInt(req.params.id);
      if(user && id){
        let userCampaign = await UserCampaign.findOne({campaign: id, user: user._id });
        if(userCampaign){
          if((userCampaign.status == 1 || userCampaign.status == -2) && userCampaign.isGiftTaken){
            if(userCampaign.images.length == userCampaign.imageCount){
              await UserCampaign.findOneAndUpdate({campaign: id, user: user._id }, {$set : { status: 2 }});
              res.status(200).json({message : 'ok'});
            }else{
              res.status(400).json({message : `There is ${ userCampaign.imageCount - userCampaign.images.length} photos missing`});
            }
          }else{
            res.status(400).json({message : "wrong status"});
          }
        }else{
          res.status(404).json({message : "user campaign not found"});
        }
      }else{
        res.status(404).json({message : "invalid parameters"});
      }
    });


    app.delete('/api/campaign/:id/images', middleware.isAuthorized, async (req,res) => {
      var id = parseInt(req.params.id);
      let user = await req.user;
      var imageId = req.body.imageId || req.query.imageId;
      if(id && user && imageId){
        var userCampaign = await UserCampaign.findOne({ campaign : id, user: user._id });
        if(userCampaign){
          var image = userCampaign.images.find( x=>x.id == imageId);
          if(image){
            await imageUplader.deleteImage(image.cloudinaryId);
            await UserCampaign.findOneAndUpdate({ campaign : id, user: user._id }, { $pull: { 'images' : { 'id': image.id } }});
            res.status(200).json({message: 'ok'});
        }else{
          res.status(404).json({message : "Image is for the wrong user"});
        }
        }else{
          res.status(404).json({message : "UserCampaign not found"});
        }
      }else{
        res.status(404).json({message : "invalid parameters"});
      }
    });

    function parseForm(req) {
      const form = new multiparty.Form();
      return new Promise((resolve, reject) => {
        form.parse(req, async (err, fields, files) => {
          if (err) {
            reject(err);
          }
          resolve({ fields, files });
        });
      });
    }

    app.post('/api/campaign/:id/images', middleware.isAuthorized, async (req, res) => {
      const id = parseInt(req.params.id);
      const user = await req.user;
      if (!id || !user) {
        return res.status(404).json({ message : 'One or more parameters is missing' });
      }

      let userCampaign = await UserCampaign.findOne({ campaign : id, user: user._id });
      if (!userCampaign) {
        return res.status(404).json({ message: 'UserCampaign not found' });
      }

      let formParsed;
      try {
        formParsed = await parseForm(req);
      } catch (error) {
        return res.status(500).json({ message: 'Internal server error' });
      }

      let { files } = formParsed;
      if (!files) {
        return res.status(400).json({ message: 'No files added' });
      }

      files = files.images;
      const addedImages = [];
      for (file of files) {
        userCampaign = await UserCampaign.findOne({ campaign : id, user: user._id });

        if (userCampaign.images.length < userCampaign.imageCount) {
          try {
            const newImage = await imageUplader.uploadImage(file.path, 'users', user._id);
            await UserCampaign.findOneAndUpdate({ campaign : id, user: user._id }, { $push: { images: newImage } });
            addedImages.push(newImage);
          } catch (err) {
            console.error(err);
          }
        }
      }

      return res.status(200).json({ message: 'ok', images: addedImages });
    });


    app.put('/api/admin/usercampaign/acceptpending', async (req, res) => {
      let userCampaignId = parseInt(req.body.userCampaignId);
      if(userCampaignId){
        let pendingCampaigns = await getPendingUserCampaigns();
        let userCampaign = pendingCampaigns.find(x => x._id == userCampaignId);
        if(userCampaign){
          if(userCampaign.isPending){
            let campaign = await Campaign.findOne({_id: userCampaign.campaign});
            let user = userCampaign.user;
            if(user.credits >= campaign.credits){
              await User.findOneAndUpdate({_id: user._id}, { $inc: { credits : - campaign.credits }});
              await Campaign.findOneAndUpdate({_id: campaign._id}, { $push: { acceptedUsers: user._id }});
              await UserCampaign.findOneAndUpdate({_id : userCampaign._id }, { $set: { isPending : false , isAccepted : true, status: 1 } });
              await pushProvider.sendCampaignAcceptedNotification(userCampaign, true, campaign);
              res.status(200).json({message: "user campaign has been accepted"});
            }else{
              res.status(400).json({message: "User do not have enaught credits"});
            }
          }else{
            res.status(404).json({message : `user campaign was processed before to ${ userCampaign.isAccepted ? 'accepted' : 'rejected' }`});
          }
        }else{
          res.status(404).json({message : "user campaign not found"});
        }
      }else{
        res.status(404).json({message : "invalid parameters"});
      }
    });
    app.put('/api/admin/usercampaign/rejectpending', async (req, res) => {
      let userCampaignId = parseInt(req.body.userCampaignId);
      if(userCampaignId){
        let pendingCampaigns = await getPendingUserCampaigns();
        let userCampaign = pendingCampaigns.find(x => x._id == userCampaignId);
        if(userCampaign){
          if(userCampaign.isPending){
            let campaign = await Campaign.findOne({_id: userCampaign.campaign});
            await UserCampaign.findOneAndUpdate({_id : userCampaign._id }, { $set: { isPending : false , isAccepted : false, status: -1 } });
            await pushProvider.sendCampaignAcceptedNotification(userCampaign, false, campaign);
            res.status(200).json({message: "user campaign has been accepted"});
          }else{
            res.status(404).json({message : `user campaign was processed before to ${ userCampaign.isAccepted ? 'accepted' : 'rejected' }`});
          }
        }else{
          res.status(404).json({message : "user campaign not found"});
        }
      }else{
        res.status(404).json({message : "invalid parameters"});
      }
    });


    app.put('/api/admin/usercampaign/acceptphotos', async (req, res) => {
      let userCampaignId = parseInt(req.body.userCampaignId);
      if(userCampaignId){
        let underReview = await getUserCampaignsByStatus(3);
        let userCampaign = underReview.find(x => x._id == userCampaignId);
        if(userCampaign){
          if(userCampaign.status == 3){
            let campaign = await Campaign.findOne({ _id :  userCampaign.campaign });
            if(campaign){
              let creditValue = campaign.rewards.find(x => x.isGlobal && x.type == 'credit');
              if(creditValue){
                await UserCampaign.findOneAndUpdate({_id : userCampaign._id }, { $set: { status: 4 } });
                await User.findOneAndUpdate({_id : userCampaign.userId }, {$inc: {credits : creditValue.value }});
                let user = await User.findOne({_id: userCampaign.userId });
                await pushProvider.creditAddCampaignNotification(user.devices, creditValue, user.credits, campaign.title);
                res.status(200).json({message: "user campaign has been accepted"});
              }else{
                res.status(404).json({message : 'reward not defined'});
              }
            }else{
              res.status(404).json({message : "campaign not found"});
            }
          }else{
            res.status(404).json({message : `invalid status should be under review`});
          }
        }else{
          res.status(404).json({message : "user campaign not found"});
        }
      }else{
        res.status(404).json({message : "invalid parameters"});
      }
    });

    app.put('/api/admin/usercampaign/rejectphotos', async (req, res) => {
      let userCampaignId = parseInt(req.body.userCampaignId);
      if(userCampaignId){
        let underReview = await getUserCampaignsByStatus(3);
        let userCampaign = underReview.find(x => x._id == userCampaignId);
        if(userCampaign){
          if(userCampaign.status == 3){
            await UserCampaign.findOneAndUpdate({_id : userCampaign._id }, { $set: { status: -2 } });
            let user = await User.findOne({_id: userCampaign.userId});
            await pushProvider.sendCampaignRejectedPhotosNotification(user.devices, userCampaign);
            res.status(200).json({message: "user campaign has been accepted"});
          }else{
            res.status(404).json({message : `invalid status should be under review`});
          }
        }else{
          res.status(404).json({message : "user campaign not found"});
        }
      }else{
        res.status(404).json({message : "invalid parameters"});
      }
    });

    app.get('/api/admin/usercampaign/pending', async (req, res) => {
        let pendingUserCampaigns = await getPendingUserCampaigns();
        let campaignId = parseFloat(req.query.id);
        res.status(200).json(pendingUserCampaigns.map(x=> {
          x.userId = x.user._id;
          x.userImage = x.user.mainImage;
          x.userEmail = x.user.email;
          delete x.user;
          delete x.uploadPicturesTo;
          delete x.uploadPicturesInstagramTo;
          delete x.imageCount;
          delete x.images;
          return x;
        }).filter(x=> {
          if(!campaignId){
            return true;
          }else{
            if(campaignId == x.campaign) {
              return true
            }else{
              return false;
            }
          }
        }));
    });
    app.get('/api/admin/usercampaign/waiting', async (req, res) => {
      let id = parseInt(req.query.id);
      let users = await getUserCampaignsByStatus(2, id);
      res.status(200).json(users);
    });

    app.put('/api/admin/usercampaign/:id/review', async (req, res) => {
      let id = parseInt(req.params.id);
      if(id){
        let userCampaign = await UserCampaign.findOne({_id: id });
        if(userCampaign){
          if(userCampaign.status == 2){
            await UserCampaign.findOneAndUpdate({_id : userCampaign._id }, { $set: { status: 3 } });
            res.status(200).json({message: "ok" });
          }else{
            res.status(400).json({message : "invalid status"});
          }
        }else{
          res.status(404).json({message : "user campaign not found"});
        }
      }else{
        res.status(404).json({message : "invalid parameters"});
      }
    });

    app.get('/api/admin/usercampaign/review', async (req, res) => {
      let id = parseInt(req.query.id);
      let users = await getUserCampaignsByStatus(3, id);
      res.status(200).json(users);
    });

    app.get('/api/admin/usercampaign/accept', async (req, res) => {
      let id = parseInt(req.query.id);
      let users = await getUserCampaignsByStatus(4, id);
      res.status(200).json(users);
    });

    app.put('/api/admin/usercampaign/winner', async (req, res) => {
      let userCampaignId = parseInt(req.body.userCampaignId);
      let position = parseInt(req.body.position);

      if(userCampaignId && position){
        let accepted = await getUserCampaignsByStatus(4);
        let userCampaign = accepted.find(x => x._id == userCampaignId);
        if(userCampaign){
          let campaign = await Campaign.findOne({ _id :  userCampaign.campaign }, {users: 0, moodboardImages: 0, tasks: 0 });
          if(campaign){
            if(campaign.winners.filter(x=>x.position == position).length == 0){
              if(userCampaign.status == 4){
                let creditValue = campaign.rewards.find(x => !x.isGlobal && x.type == 'credit' && x.position == position);
                if(creditValue){
                  let winner = {
                    position: position,
                    user: userCampaign.userId
                  }
                  await Campaign.findOneAndUpdate({ _id: userCampaign.campaign }, {$push: { winners : winner }});
                  await User.findOneAndUpdate({_id : userCampaign.userId }, {$inc: {credits : creditValue.value }});
                  let user = await User.findOne({_id: userCampaign.userId });
                  await pushProvider.creditCampaignWinNotification(user.devices, creditValue);
                  res.status(200).json({message: "you set the winner"});
                }else{
                  res.status(404).json({message : 'reward not defined'});
                }
              }else{
                res.status(404).json({message : `invalid status should be accepted`});
              }
            }else{
              res.status(404).json({message : `winner for position ${position} arleady set`});
            }
          }else{
            res.status(404).json({message : "campaign not found"});
          }
        }else{
          res.status(404).json({message : "user campaign not found"});
        }
      }else{
        res.status(404).json({message : "invalid parameters"});
      }
    });

    getUserCampaignsByStatus = async (status, campaignId) => {
      let userByStatus = await UserCampaign
      .aggregate([{
                '$lookup': {
                  'from': 'users', 
                  'localField': 'user', 
                  'foreignField': '_id', 
                  'as': 'user'
                }
              }, {
                '$unwind': {
                  'path': '$user'
                }
              }, 
              {
                '$match': {
                  'status': status
                }
              }]).toArray();
      return userByStatus.map(x=> {
        x.userId = x.user._id;
        x.userImage = x.user.mainImage;
        x.userEmail = x.user.email;
        delete x.user;
        delete x.uploadPicturesTo;
        delete x.uploadPicturesInstagramTo;
        return x;
      }).filter(x=> {
        if(!campaignId){
          return true;
        }else{
          if(campaignId == x.campaign) {
            return true
          }else{
            return false;
          }
        }
      });
    };
    getPendingUserCampaigns = async () =>{
     return await UserCampaign
      .aggregate([{
                '$lookup': {
                  'from': 'users', 
                  'localField': 'user', 
                  'foreignField': '_id', 
                  'as': 'user'
                }
              }, {
                '$unwind': {
                  'path': '$user'
                }
              }, 
              {
                '$match': {
                  'isPending': true
                }
              }]).toArray();
    };
}