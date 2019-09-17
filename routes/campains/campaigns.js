let campaignSchema = require('../../model/campaign/campaignSchema');
let viewModels = require('../../model/campaign/campaignViewModel');
let moment = require('moment');
let imageUplader = require('../../lib/imageUplader');
let multiparty = require('multiparty');
let middleware = require('../../config/authMiddleware');
let crypto = require('crypto');

module.exports = (app, User, Campaign, UserCampaign, CampaignInterval, getNewId) => {
  //create new campaing
  app.post('/api/admin/campaign', async (req, res) => {
    let campaign =  req.body;
    let errors = campaignSchema.campaignSchema.validate(campaign);
    if(errors.length == 0){
      let rewardValidator = await validateRewards(campaign.rewards);
      let taskValidator = await validateTasks(campaign.tasks)
      if(rewardValidator.isValid && taskValidator.isValid){
        campaign._id = await getNewId('campaignId');
        campaign.mainImage = null;
        campaign.qrCode = crypto.randomBytes(20).toString('hex');
        campaign.users = [];
        campaign.exampleImages = [];
        campaign.moodboardImages = [];
        campaign.winners = [];
        campaign.acceptedUsers = [];
        await Campaign.insertOne(campaign);
        const users = await User.find({}, { projection: { devices: 1 }}).toArray();
        const allDevices = [];
        for (const user of users) {
          if (user.devices) {
            allDevices.push(...user.devices);
          }
        }
        await pushProvider.sendNewCampaignNotification(allDevices, campaign);
        res.status(200).json(campaign);
      }else{
        res.status(400).json({message: rewardValidator.error + ' ' + taskValidator.error});
      }
    }else{
      res.status(400).json(errors.map(x=>x.message));
    }
  });
  // get raw campaigns for admin 
  app.get('/api/admin/campaign', async (req, res) => {
    let campaigns = await Campaign.find({}).toArray();
    res.status(200).json(campaigns);
  });
  app.get('/api/campaign/bookings', middleware.isAuthorized, async (req,res) => {
    let user = await req.user;
    if(user){
    let userBookings = await UserCampaign
    .aggregate([
        {
            '$lookup': {
                'from': 'campaigns', 
                'localField': 'campaign', 
                'foreignField': '_id', 
                'as': 'campaign'
            }
        }, {
            '$unwind': {
                'path': '$campaign'
            }
        }, {
            '$match': {
                'isAccepted': true,
                'user': user._id
            }
        }
    ]).toArray();
    res.status(200).json(userBookings.map(x => {
      if(moment().isBefore(moment(x.campaign.availableTill))){
        let obj = {
          title : x.campaign.title,
          campaignId: x.campaign._id,
          pickUpDate: x.slot && x.slot.date ? `${x.slot.date} ${x.slot.startTime}` : null,
          mainImage: x.campaign.mainImage,
          isGiftTaken: x.isGiftTaken,
          location: x.location
        }
        return obj;
      }
    }).filter(x => x != null));
    }else{
      res.status(400).json({message: "user not found"});
    }
  });

  app.get('/api/campaign/:id', middleware.isAuthorized, async (req, res) => {
    let user = await req.user;
    let id = parseInt(req.params.id);
    if(user){
      let campaigns = await Campaign.find({}).toArray();
      let campaign = viewModels.toMobileViewModel(campaigns, user, true).filter(x => x._id == id)[0];
      if(campaign){
        if(campaign.hasWinner){
          campaign.userWinner = await User.findOne({_id: campaign.winners.find(x=>x.position == 1).user });
          campaign.userWinner = {
            _id: campaign.userWinner._id,
            mainImage: campaign.userWinner.mainImage,
            instagramName: campaign.userWinner.instagramName,
          }
        }
        if(campaign.isParticipant){
          let userCampaigns = await UserCampaign.findOne({campaign : campaign._id, user : user._id });
          let viewModel = await viewModels.joinCampaignWithUserCampaign(campaign, userCampaigns);
          res.status(200).json(viewModel);
        }else{
          res.status(200).json(campaign);
        }
      }else{
        res.status(400).json({message : 'not found'});
      }
    }else{
      res.status(400).json({message : 'not authoirze'});
    }
  });
  app.get('/api/campaign/:id/photos', middleware.isAuthorized, async (req, res) => {
    let user = await req.user;
    let id = parseInt(req.params.id);
    if(user){
      let campaigns = await UserCampaign.find({campaign: id}).toArray();
      campaigns = campaigns.map(x => {
        let images = x.images.map( xx=> {
          return xx.url;
        })
        return images;
      })
      res.status(200).json(campaigns);
    }else{
      res.status(400).json({message : 'not authoirze'});
    }
  });

  app.post('/api/campaign/:id/images/main', async (req,res) => {
    var id = parseInt(req.params.id);
    if(id){
      var campaign = await Campaign.findOne({ _id : id });
      if(campaign){
      var form = new multiparty.Form();
      form.parse(req, async function (err, fields, files) {
        if(files){
          file = files.images[0];
          await imageUplader.uploadImage(file.path, 'campaigns', campaign._id)
            .then(async (newImage) =>{
              await Campaign.findOneAndUpdate({ _id: id }, { $set: { mainImage: newImage.url } })
            })
            .catch((err) => {
              console.log(err);
            });
          res.status(200).json({message: "ok"});
        }else{
          res.status(400).json({message : "no files added"});
        }
      });
    }else{
      res.status(404).json({message : "Campaign not found" });
    }
    }else{
    res.status(404).json({message : "invalid parameters"});
      }
  });

  //Add new images to image examples
  app.post('/api/campaign/:id/images/examples', async (req,res) => {
    var id = parseInt(req.params.id);
    if(id){
      var campaign = await Campaign.findOne({ _id : id });
      if(campaign){
      var form = new multiparty.Form();
      form.parse(req, async function (err, fields, files) {
        if(files){
          files = files.images;
          for (file of files) {
            await imageUplader.uploadImage(file.path, 'campaign', campaign._id)
              .then(async (newImage) =>{
                await Campaign.findOneAndUpdate({ _id: id }, { $push: { exampleImages: newImage } })
              })
              .catch((err) => {
                console.log(err);
              });
          }
          res.status(200).json({message: "ok"});
        }else{
          res.status(400).json({message : 'no files added'});
        }
      });
    }else{
      res.status(404).json({message : "campaign not found" });
    }
    }else{
      res.status(404).json({message : "invalid parameters"});
      }
  });
//Delete image from examples
app.delete('/api/campaign/:id/images/examples', async (req,res) => {
  var id = parseInt(req.params.id);
  var imageId = req.body.imageId;
  if(id){
    var campaign = await Campaign.findOne({ _id : id });
    if(campaign){
      var image = campaign.exampleImages.find( x=>x.id == imageId);
      if(image){
        await imageUplader.deleteImage(image.cloudinaryId)
        .then(() => {
          Campaign.findOneAndUpdate({_id: id}, { $pull: { 'exampleImages' : { 'id': image.id } }})
            .then(async () => {
              res.status(200).json({message: 'ok'});
            })
            .catch((err) => {
              console.log(err);
            })
        })
        .catch((err) => {
          res.status(400).json({message : err });
      });
    }else{
      res.status(404).json({message : "Image is for the wrong Campaign"});
    }
    }else{
      res.status(404).json({message : "Campaign not found"});
    }
  }else{
    res.status(404).json({message : "invalid parameters"});
  }
});
//Add new images to moodboard
app.post('/api/campaign/:id/images/moodboard', async (req,res) => {
  var id = parseInt(req.params.id);
  if(id){
    var campaign = await Campaign.findOne({ _id : id });
    if(campaign){
    var form = new multiparty.Form();
    form.parse(req, async function (err, fields, files) {
      if(files){
        files = files.images;
        for (file of files) {
          await imageUplader.uploadImage(file.path, 'campaign', campaign._id)
            .then(async (newImage) =>{
              await Campaign.findOneAndUpdate({ _id: id }, { $push: { moodboardImages: newImage } })
            })
            .catch((err) => {
              console.log(err);
            });
        }
        res.status(200).json({message: "ok"});
      }else{
        res.status(400).json({message : 'no files added'});
      }
    });
  }else{
    res.status(404).json({message : "campaign not found" });
  }
  }else{
    res.status(404).json({message : "invalid parameters"});
    }
});
//Delete image from moodboard
app.delete('/api/campaign/:id/images/moodboard', async (req,res) => {
var id = parseInt(req.params.id);
var imageId = req.body.imageId;
if(id){
  var campaign = await Campaign.findOne({ _id : id });
  if(campaign){
    var image = campaign.moodboardImages.find( x=>x.id == imageId);
    if(image){
      await imageUplader.deleteImage(image.cloudinaryId)
      .then(() => {
        Campaign.findOneAndUpdate({_id: id}, { $pull: { 'moodboardImages' : { 'id': image.id } }})
          .then(async () => {
            res.status(200).json({message: 'ok'});
          })
          .catch((err) => {
            console.log(err);
          })
      })
      .catch((err) => {
        res.status(400).json({message : err });
    });
  }else{
    res.status(404).json({message : "Image is for the wrong Campaign"});
  }
  }else{
    res.status(404).json({message : "Campaign not found"});
  }
}else{
  res.status(404).json({message : "invalid parameters"});
}
});
  
 app.post('/api/campaign/:id/images/reward/global', async (req,res) => {
  var id = parseInt(req.params.id);
  if(id) {
    var campaign = await Campaign.findOne({ _id : id });
    if(campaign){
    var form = new multiparty.Form();
    form.parse(req, async function (err, fields, files) {
      if(files){
        files = files.images;
        for (file of files) {
          await imageUplader.uploadImage(file.path, 'campaign', campaign._id)
            .then(async (newImage) => {
              
              await Campaign.updateOne(
                { '_id': id },
                { $set: { 'rewards.$[t].mainImage': newImage.url }},
                { arrayFilters: [ {"t.isGlobal": true  } ] });

                res.status(200).json({message: "ok"});
            })
            .catch((err) => {
              console.log(err);
            });
        }
      }else{
        res.status(400).json({message : 'no files added'});
      }
    });
  }else{
    res.status(404).json({message : "campaign not found" });
  }
  }else{
    res.status(404).json({message : "invalid parameters"});
    }
});

app.post('/api/campaign/:id/images/reward/:position', async (req,res) => {
  var id = parseInt(req.params.id);
  let position = parseInt(req.params.position);
  if(id && position){
    var campaign = await Campaign.findOne({ _id : id });
    if(campaign){
    var form = new multiparty.Form();
    form.parse(req, async function (err, fields, files) {
      if(files){
        files = files.images;
        for (file of files) {
          await imageUplader.uploadImage(file.path, 'campaign', campaign._id)
            .then(async (newImage) => {
              
              await Campaign.updateOne(
                { '_id': id },
                { $set: { 'rewards.$[t].mainImage': newImage.url }},
                { arrayFilters: [ {"t.position": position  } ] });

                res.status(200).json({message: "ok"});
            })
            .catch((err) => {
              console.log(err);
            });
        }
      }else{
        res.status(400).json({message : 'no files added'});
      }
    });
  }else{
    res.status(404).json({message : "campaign not found" });
  }
  }else{
    res.status(404).json({message : "invalid parameters"});
    }
});
  
app.get('/api/admin/campaign/:id', async (req, res) => {
  let id = parseInt(req.params.id);
  if(id){
    let campaign = await Campaign.findOne({_id: id});
    res.status(200).json(campaign);
  }else{
    res.status(400).json({message : 'Invalid parameters'});
  }
});
app.get('/api/admin/campaign/:id/participant', async (req, res) => {
  let id = parseInt(req.params.id);
  if(id){
    let campaign = await Campaign.findOne({_id: id});
    let userCampaigns = await UserCampaign
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
                'campaign': id
              }
            }]).toArray();
    let returnArray = await Promise.all(userCampaigns.map(async x => {
      let user = {
        _id: x.user.id,
        name: x.user.name,
        surname: x.user.surname,
        nationality: x.user.nationality,
        currentAgency: x.user.currentAgency,
        motherAgency: x.user.motherAgency,
        instagramName: x.user.instagramName,
        phone: x.user.phone,
        email: x.user.email,
        birthDate: x.user.birthDate,
        images: x.images,
        status: x.status,
        isMissingPhotos: x.imageCount > x.images.length,
        isWinner: campaign.winners.filter(xx => xx.user == x.user._id).length > 0,
        statusDescription: await viewModels.getStatusDescription(x.status)
      }
      return user;
    }));
    res.status(200).json(returnArray);
  }else{
    res.status(400).json({message : 'Invalid parameters'});
  }
});
app.get('/api/admin/campaign/:id/booking', async (req, res) => {
  let id = parseInt(req.params.id);
  if(id){
    let campaign = await Campaign.findOne({_id: id});
    let userCampaigns = await UserCampaign
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
                'campaign': id
              }
            }]).toArray();
    let intervals = await CampaignInterval.find({campaign: campaign._id}).toArray();
    let returnIntervals = intervals.map(interval => {
       let returnObject = {
         address: interval.address,
         spotsCount: interval.intervals.length,
         bookings: []
       }
       let filteredCampaigns = userCampaigns.filter(x=> x.location.address == interval.location.address);
       returnObject.userCount = filteredCampaigns.length;
       const result = [];
       const map = new Map();
       for (const item of filteredCampaigns) {
           if(!map.has(item.slot.date)){
               map.set(item.slot.date, true);    // set any value to Map
               result.push({
                   date: item.slot.date,
                   day: item.slot.day
               });
           }
       }
       for (const item of result.sort((a,b) => moment(a.date).format('YYYYMMDD') - moment(b.date).format('YYYYMMDD'))) {
         let bookingDate = {
            date: item.date,
            day: item.day
         };
         bookingDate.intervals = interval.intervals.filter(x=> x.day == bookingDate.day).map(x=> {
           let singleInterval = {
             range: `${x.start} - ${x.end}`,
             users: filteredCampaigns.filter(xx => xx.slot.startTime == x.start && xx.slot.date == bookingDate.date)
                .map(xx=>{
                  let user= {
                    mainImage: xx.user.mainImage,
                    name: xx.user.name,
                    surname: xx.user.surname,
                  };
                  return user;
                }),
             usersCount: filteredCampaigns.filter(xx => xx.slot.startTime == x.start && xx.slot.date == bookingDate.date).length
           }
          return singleInterval;
         });
        returnObject.bookings.push(bookingDate);
       }
       return returnObject;
    })
    res.status(200).json(returnIntervals);
  }else{
    res.status(400).json({message : 'Invalid parameters'});
  }
});

app.put('/api/admin/campaign/:id', async (req, res) => {
  let id = parseInt(req.params.id);
  let campaign = JSON.parse(JSON.stringify(req.body)); ;
  let campaignToValidate = req.body;
  if(id){
    let dbCampaign = await Campaign.findOne({ _id: id });
    if(dbCampaign){
      let errors = campaignSchema.campaignSchema.validate(campaignToValidate);
      if(errors.length == 0){
        let rewardValidator = await validateRewards(campaign.rewards);
        let taskValidator = await validateTasks(campaign.tasks)
        if(rewardValidator.isValid && taskValidator.isValid){
          
          await Campaign.replaceOne({_id : id } , campaign);
          campaign = await Campaign.findOne({ _id: id });
          res.status(200).json(campaign);
        }else{
          res.status(400).json({message: rewardValidator.error + ' ' + taskValidator.error});
        }
      }else{
        res.status(400).json(errors.map(x=>x.message));
      }
    }else{
      res.status(400).json({message : 'Campaign not found'});
    }
  }else{
    res.status(400).json({message : 'Invalid parameters'});
  }
});

app.delete('/api/admin/campaign/:id', async (req, res) => {
  let id = parseInt(req.params.id);
  let confirm = req.query.confirm;
  if(id){
    let campaign = await Campaign.findOne({ _id: id });
    if(campaign){
      let users = campaign.users;
      if(users.length > 0 && !confirm){
        res.status(400).json({message : 'Campaign has some users to remove it please send query param ?confirm=true'});
      }else{
        await Campaign.deleteOne({_id: id});
        res.status(200).json({message: "Campaign deleted"})
      }
    }else{
      res.status(400).json({message : 'Campaign not found'});
    }
  }else{
    res.status(400).json({message : 'Invalid parameters'});
  }
});


app.get('/api/campaign', middleware.isAuthorized, async (req, res) => {
  let user = await req.user;
  if(user){
    let campaigns = await Campaign.find({}).toArray();
    res.status(200).json(viewModels.toMobileViewModel(campaigns, user, false));
  }else{
    res.status(400).json({message : 'not authoirze'});
  }
});

validateTasks = async(tasks) => {
  let validateObject = {
    isValid: true,
    error: ""
  }
  if(tasks && Array.isArray(tasks)){
    let photoTask = tasks.find(x=>x.type == 'photo');
    if(!photoTask){
      validateObject.isValid = false;
      validateObject.error = 'task of type photo must be set';
    }else{
      if(!photoTask.count){
        validateObject.isValid = false;
        validateObject.error = 'task of type photo must have count property';
      }
    }
  }else{
    validateObject.isValid = false;
    validateObject.error = 'tasks must be set';
  }
  return validateObject;
}

validateRewards = async(rewards) => {
  let validateObject = {
    isValid: true,
    error: ""
  }
  if(rewards && Array.isArray(rewards)){
    rewards.forEach(reward => {
      //validate isGlobal
      if(reward.isGlobal){
        if(reward.position){
          validateObject.isValid = false;
          validateObject.error = 'for global reward position is invalid';
        }
      }else{
        if(!reward.position){
          validateObject.isValid = false;
          validateObject.error = 'for non global reward position must be set';
        }
      }
      //validate credit
      if(reward.type == 'credit'){
        if(!reward.value){
          validateObject.isValid = false;
          validateObject.error = 'for credit reward value must be set';
        }
      }
      if(reward.type == 'gift'){
        if(!reward.description){
          validateObject.isValid = false;
          validateObject.error = 'for gift reward description must be set';
        }
      }
    });
  }else{
    validateObject.isValid = false;
    validateObject.error = 'rewards must be set';
  }
  return validateObject;
}
}
