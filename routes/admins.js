var db = require('../config/connection');
var middleware = require('../config/authMiddleware');
var apn = require('apn');
var moment = require('moment');

var apnProvider = new apn.Provider({
  production: false,
});

async function userAcceptNotification(devices) {
  var note = new apn.Notification();
    note.expiry = Math.floor(Date.now() / 1000) + 3600; // Expires 1 hour from now.
    note.badge = 1;
    note.alert = `\uD83D\uDCE7 \u2709 Your account has beed accepted!`;
    note.payload = { message: `Now you have access to all resources`, pushType: 'userAccept' };
  devices.forEach(async (device) => {
     await apnProvider.send(note, device);
  });
  
}
async function userRejectNotification(devices) {
  var note = new apn.Notification();
  note.expiry = Math.floor(Date.now() / 1000) + 3600; // Expires 1 hour from now.
  note.badge = 1;
  note.alert = `\uD83D\uDCE7 \u2709 Your account has beed rejected!`;
  note.payload = { message: `You lost access to account`, pushType: 'userRejected' };

  devices.forEach(async (device) => {
     await apnProvider.send(note, device);
  });
}
async function actionAcceptNotification(devices) {
    var note = new apn.Notification();
    note.expiry = Math.floor(Date.now() / 1000) + 3600; // Expires 1 hour from now.
    note.badge = 1;
    note.alert = `\uD83D\uDCE7 \u2709 You get new credits!`;
    note.payload = { message: `We accepted your action`, pushType: 'actionAccepted' };
  
    devices.forEach(async (device) => {
       await apnProvider.send(note, device);
    });
}

var User, Place, Offer, OfferPost, Booking;
db.getInstance(function (p_db) {
  User = p_db.collection('users');
  Place = p_db.collection('places');
  Offer = p_db.collection('offers');
  OfferPost = p_db.collection('offerPosts');
  Booking = p_db.collection('bookings');
});

module.exports = function(app) {

  app.put(['/api/admin/model/:id/accept'],middleware.isAdmin, function (req, res) {
    var id = parseInt(req.params.id);
    var level = parseInt(req.body.level) || 4;

    User.findOneAndUpdate({ _id: id }, { $set: { accepted: true, level: level }},{new: true}, function (err, updated) {
      if(err) res.json({ message: "error" });
      if(updated.value !== undefined && updated.value !== null){
        var devices = updated.value.devices;

        userAcceptNotification(devices)
        .then(x=>{
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

    User.findOneAndUpdate({ _id: id }, { $set: { accepted: false }},{new: true}, function (err, updated) {
      if(err) res.json({ message: "error" });
      if(updated.value !== undefined && updated.value !== null){
        var devices = updated.value.devices;

        userRejectNotification(devices)
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

  // Constant payments or penalties for models which
  // level differs from the offer's level
  const levelDiffBooking = [
    [0, -50, -100, -150, -200],
    [0, 0, -50, -100, -150],
    [0, 0, 0, -50, -100],
    [30, 30, 30, 0, -50],
    [40, 40, 40, 40, 0]
  ];
  const levelDiffReviews = [
    30, 40, 60, 70, 100
  ];

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
            // Everything is just for calculating how should user's credits change in order
            // to offer-user-level system.
            // levelDiffReviews[user.level] + levelDiffBooking - book.payed =+ user.credits

            Booking.findOne({ offer: offer._id }, function (err, book) {
              if(!book) {
                res.json({ message: "Booking for the offer not found" });
              } else {
                User.findOne({ _id: offerPost.user }, function (err, user) {
                  if(!user.level) {
                    res.json({ message: "User has no level" });
                  } else {
                    var payment = levelDiffReviews[user.level - 1] + levelDiffBooking[user.level - 1][offer.level - 1] - book.payed;

                    User.findOneAndUpdate({ _id: offerPost.user }, { $inc: { credits: payment }});
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
    //find post action in db
    OfferPost.findOne({ _id: id })
      .then(offerPost => {
        if(!offerPost.accepted){
          User.findOneAndUpdate({ _id: offerPost.user }, { $inc: { credits: offerPost.credits } })
            .then(user => {
              actionAcceptNotification(user.value.devices)
                .then(() => {
                  OfferPost.findOneAndUpdate({_id: id },{ $set: { accepted: true } })
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
      .then(offerPost => {
        if(offerPost.accepted){
          res.status(400).json({message: 'action arleady accepted'});
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
};
