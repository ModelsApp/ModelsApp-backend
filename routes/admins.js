var db = require('../config/connection');
var middleware = require('../config/authMiddleware');
var moment = require('moment');
var sendgrid = require('../lib/sendGrid');
var pushProvider = require('../lib/pushProvider');

var User, Place, Offer, OfferPost, Booking;
db.getInstance(function (p_db) {
  User = p_db.collection('users');
  Place = p_db.collection('places');
  Offer = p_db.collection('offers');
  OfferPost = p_db.collection('offerPosts');
  Booking = p_db.collection('bookings');
  OfferPostArchive = p_db.collection('offerPostArchive');
});

module.exports = function(app) {

  app.put(['/api/admin/model/:id/accept'], async function (req, res) {
    var id = parseInt(req.params.id);
    var level = parseInt(req.body.level) || 4;
    let isPaymentRequired = req.body.isPaymentRequired;
    if(isPaymentRequired){
      await User.findOneAndUpdate({ _id: id }, { $set: { isPaymentRequired: isPaymentRequired }});
    }

    User.findOneAndUpdate({ _id: id }, { $set: { accepted: true, level: level, isAcceptationPending: false }},{new: true}, async function (err, updated) {
      if(err) res.json({ message: "error" });
      if(updated.value !== undefined && updated.value !== null){
        var devices = updated.value.devices;

        pushProvider.userAcceptNotification(devices, isPaymentRequired)
        .then(async (x) =>{
          await sendgrid.sendUserAcceptedMail(updated.value.email, req);
          res.json({ message: "The model has been accepted" });
        })
        .catch(err =>{
          console.log(err);
        });
      } else{
        res.json({ message: "No such user" });
      }
    });
  });
  app.put(['/api/admin/model/:id/reject'], function (req, res) {
    var id = parseInt(req.params.id);

    User.findOneAndUpdate({ _id: id }, { $set: { accepted: false, isAcceptationPending: false }},{new: true}, function (err, updated) {
      if(err) res.json({ message: "error" });
      if(updated.value !== undefined && updated.value !== null){
        var devices = updated.value.devices;

        pushProvider.userRejectNotification(devices)
        .then(x=>{
          res.json({ message: "The model has been rejected" });
        })
        .catch(err =>{
          console.log(err);
        });
          
      } else{
        res.json({ message: "No such user" });
      }
    });
  });
  app.put(['/api/admin/model/:id/payment'], async function (req, res) {
    var id = parseInt(req.params.id);
    let isPaymentRequired = req.body.isPaymentRequired;
    if(id && typeof isPaymentRequired === "boolean"){
      let user =  await User.findOne({_id: id});
      if(user){
        await User.findOneAndUpdate({_id: id}, {$set: { isPaymentRequired : isPaymentRequired }});
        res.status(200).json({message : "ok"});
      }else{
        res.status(400).json({ message: "No such user" });
      }
    }else{
      res.status(400).json("invalid parameters");
    }
  });

  app.put('/api/admin/model/:id/extraCredits', (req, res) => {
    var id = parseInt(req.params.id);
    var creditValue = parseInt(req.body.credits);
    if(id && creditValue){
      User.findOneAndUpdate({ _id : id }, { $inc: { credits: creditValue }}).then( (user) => {
        pushProvider.creditAddNotification(user.value.devices, creditValue).then(() =>{
          res.status(200).json({message: "Credits added"});
        });
      });
    }else{
      res.status(400).json({ message: "Invalid parameters" });
    }
  });

  // Accept the model's post to deal with her offer
  app.put('/api/admin/acceptOfferPost/:id', middleware.isAdmin, function (req, res) {
    var id = parseInt(req.params.id);

    OfferPost.findOne({ _id: id }, function (err, offerPost) {
      if(err) res.json({ message: "error" });
      if(!offerPost){
        res.json({ message: "No such offer post" });
      } else {
        Offer.findOne({ _id: offerPost.offer }, function (err, offer) {
          if(!offer){
            res.json({ message: "No such Offer" });
          } else {
            Booking.findOne({ offer: offer._id }, function (err, book) {
              if(!book) {
                res.json({ message: "Booking for the offer not found" });
              } else {
                User.findOne({ _id: offerPost.user }, function (err, user) {
                  if(!user.level) {
                    res.json({ message: "User has no level" });
                  } else {
                    User.findOneAndUpdate({ _id: offerPost.user }, { $inc: { credits: -book.payed }});
                    Offer.findOneAndUpdate({ _id: offerPost.offer }, { $set: { closed: true }});
                    OfferPost.findOneAndUpdate({ _id: id }, { $set: { accepted: true }});

                    res.json({ message: "The offer has been accepted" });
                  }
                });
              }
            });
          }
        });
      }
    });
  });

  app.put('/api/admin/offerpost/:id/accept', async (req,res)=> {
    var id = parseInt(req.params.id);
    var approvementLink = req.body.approvementLink;
    //find post action in db
    OfferPost.findOne({ _id: id })
      .then(offerPost => {
        if(!offerPost.accepted){
          User.findOneAndUpdate({ _id: offerPost.user }, { $inc: { credits: offerPost.credits } })
            .then(user => {
              pushProvider.actionAcceptNotification(user.value.devices)
                .then(() => {
                  OfferPost.findOneAndUpdate({_id: id },{ $set: { accepted: true, approvementLink: approvementLink } })
                    .then(() => {
                      res.status(200).json({message: 'credits added for a user'});
                    })
                    .catch(err => {
                      res.status(500).json({message: err});
                    });
                })
                .catch(err => {
                  res.status(500).json({message: err});
                });
            })
            .catch(err => {
              res.status(404).json({message: 'user not found'});
            });
        }else{
          res.status(400).json({message: 'action arleady accepted'});
        }
      })
      .catch(err => {
        res.status(404).json({message: 'action not found'});
      });
  });
  app.put('/api/admin/offerpost/:id/reject', async (req,res)=> {
    var id = parseInt(req.params.id);
    //find post action in db
    OfferPost.findOne({ _id: id })
      .then(async offerPost => {
        if(offerPost.accepted){
          res.status(400).json({message: 'action arleady accepted'});
        }else{
          await OfferPost.deleteOne({ _id : id });
          await OfferPostArchive.findOneAndUpdate({_id : 0 }, { $push : { posts : offerPost } });
          res.status(400).json({message: 'action rejected'});
        }
      })
      .catch(err => {
        res.status(404).json({message: 'action not found'});
      });
  });
  // Reject the Offer Post without difficulties
  app.put('/api/admin/rejectOfferPost/:id', middleware.isAdmin, function (req, res) {
    var id = parseInt(req.params.id);

    OfferPost.findOneAndUpdate({ _id: id }, { $set: { accepted: false }}, function (err, updated) {
      if(err) res.json({ message: "error" });
      if(!updated.value){
        res.json({ message: "No such offer" });
      } else{
        res.json({ message: "The offer has been rejected" });
      }
    });
  });

  app.put('/api/admin/rankModel/:id', middleware.isAdmin, function (req, res) {
    var id = parseInt(req.params.id);
    var level = parseInt(req.body.level);

    if(level >= 0 && level <= 5){
      User.findOneAndUpdate({ _id: id}, { $set: { level: level }}, function (err, updated) {
        if(err) res.json({ message: "Error" });
        if(updated.value !== undefined && updated.value !== null){
          res.json({ message: "The level is updated" });
        } else{
          res.json({ message: "No such user" });
        }
      });
    } else {
      res.json({ message: "Level is out of range" });
    }
  });

  app.put('/api/admin/rankPlace/:id', middleware.isAdmin, function (req, res) {
    var id = parseInt(req.params.id);
    var level = parseInt(req.body.level);

    if(level >= 0 && level <= 5){
      Place.findOneAndUpdate({ _id: id }, { $set: { level: level }}, function (err, updated) {
        if(err) res.json({ message: "Error" });
        if(updated.value !== undefined && updated.value !== null){
          res.json({ message: "The level is updated" });
        } else{
          res.json({ message: "No such place" });
        }
      });
    } else {
      res.json({ message: "Level is out of range" });
    }
  });
  
  app.get('/api/admin/users/pending', (req, res) => {
    User.find({ isAcceptationPending: true }).toArray(async function (err, users) {
      res.status(200).json(users);
    });
  });
  app.get('/api/admin/users/offerPosts', (req,res) =>{
    var data = new Array();
    OfferPost.aggregate([
      {
        '$group': {
          '_id': '$creationDate', 
          'offerPosts': {
            '$push': '$$ROOT'
          }
        }
      }
    ], function(err, cursor) {
      User.find({}).toArray(async function(err, users){
        users = users.map(x => {
          return {
            _id : x._id,
            credits: x.credits,
            name: x.name,
            surname: x.surname,
            instagramName: x.instagram ? x.instagram.full_name : x.instagramName,
            email:  x.email,
            photo: x.photo
          }
        });
        await cursor.forEach(async function(c){
          var singleData = {
            date: c._id,
            offerPosts: c.offerPosts
          };
          singleData.offerPosts.forEach( element => {
            var user = users.find(x=>x._id == element.user);
            element.user = user;
          });
          data.push(singleData);
        });
        res.status(200).json(data);
      });
    });
  });
  app.get('/api/admin/user/:id/followers', async (req, res) => {
    var id = parseInt(req.params.id);
    if(id){
      User.find({}).toArray(async function(err, users){
        users = mapUsers(users);

        user = users.find((user) => user._id == id);
        if(user){
         await getFollowers(users, user);
          res.status(200).json(user);
        }else{
          res.status(404).json({message: "User not found"});
        }
      });
    }
    else{
      res.status(400).json({message: "Invalid parameters"});
    }
  });

 async function getFollowers(users, user){
    user.followers = [];
    if(users.find(x => x.referredFrom == user._id)){
      var foundUsers =  users.filter(x => x.referredFrom == user._id);
      await foundUsers.forEach( async element => {
        await getFollowers(users, element);
        user.followers.push(element);
      });
    }
  }
  function mapUsers(users){
   return users.map(x => {
      return {
        _id : x._id,
        credits: x.credits,
        name: x.name,
        email:  x.email,
        photo: x.photo,
        referredFrom: x.referredFrom
      }
    });
  }
};
