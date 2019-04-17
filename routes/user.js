var db = require('../config/connection');
var middleware = require('../config/authMiddleware');
var apn = require('apn');
var moment = require('moment');

var apnProvider = new apn.Provider({
  production: false,
});

async function sendIos(deviceId, user) {
  var note = new apn.Notification();
  note.expiry = Math.floor(Date.now() / 1000) + 3600; // Expires 1 hour from now.
  note.badge = 1;
  note.alert = `\uD83D\uDCE7 \u2709 New referral!`;
  note.payload = { message: `You have one new referral: ${user}`, referralAccepted: 1 };

  var data = await apnProvider.send(note, deviceId);
  return data;
}

var User, Booking, Offer, Place, OfferPost;
db.getInstance(function (p_db) {
  User = p_db.collection('users');
  Offer = p_db.collection('offers');
  Booking = p_db.collection('bookings');
  Place = p_db.collection('places');
  OfferPost = p_db.collection('offerPosts');
});

module.exports = function(app) {

  // Get the current (authenticated) User
  app.get('/api/user/current', middleware.isAuthorized, async function (req, res) {
    var user = await req.user;
    res.json(user);
  });

  // Get specific user
  app.get('/api/user/:id', function (req, res) {
    var id = parseInt(req.params.id);
    User.findOne({ _id: id }, function (err, user) {
      if(!user) {
        res.json({ message: "No such user" });
      } else {
        res.json(user);
      }
    });
  });

  // Get Users by specific query
  app.get('/api/user', function (req, res) {
    var query = {};
    if(req.body.id) query._id = parseInt(req.body.id);
    if(req.body.name) query.name = req.body.name;

    User.find(query).toArray(function (err, users) {
      if(err) console.log(err);
      if(users.length === 0){
        res.json({ message: "No users found" });
      } else{
        res.json(users);
      }
    });
  });

  // Delete specific User
  // not handle flag anywhere in system
  app.delete('/api/user/:id', function (req, res) {
    User.findOneAndUpdate({ _id: parseInt(req.params.id)}, { $set: {deleted: true } }, function (err, user) {
      if(err) res.json({ message: err });
      if(!user){
        res.json({ message: "No such user" })
      } else {
        // User.deleteOne({ _id: parseInt(req.params.id) }, function(err, user){
        //   res.json({ message: "Deleted" });
        // });
        res.json({message: "user deleted"});
      }
    });
  });

  // Add a price plan to the user
  app.put('/api/user/:id/plan', function (req, res) {
    var id = parseInt(req.params.id);

    if(req.body.plan && req.body.months && id) {
      var plan = {};
      plan.plan = req.body.plan;
      plan.payedDate = moment().format('DD-MM-YYYY');
      plan.dueTo = moment().add(parseInt(req.body.months), 'M').format('DD-MM-YYYY');
      plan.active = true;

      User.findOneAndUpdate({ _id: id }, { $set: { plan: plan }}, function (err, user) {
        if(!user.value) {
          res.json({ message: "No such user" });
        } else {
          res.json({ message: "Successfully updated" });
        }
      })
    } else {
      res.json({ message: "Not all fields are provided" });
    }
  });

  // Get User Plans for the Admins wallet section
  app.get('/api/users/plan', function (req, res) {
    User.find({ 'plan.plan': { $exists: true }}, { projection: { name: 1, surname: 1, photo: 1, credits: 1, plan: 1 }}).toArray(function (err, users) {
      res.json(users)
    });
  });

  // Edit Current (authenticated) User
  app.put('/api/user/current', middleware.isAuthorized, async function (req, res) {
    var newUser = req.body;
    var user1 = await req.user;

    editUser(parseInt(user1._id), newUser, res);
  });

  // Edit specific User
  app.put('/api/user/:id', function (req, res) {
    var id = parseInt(req.params.id);
    var newUser = req.body;

    editUser(id, newUser, res);
  });

  // Get the bookings belonging to specific User
  app.get('/api/user/:id/bookings', function (req, res) {
    var id = parseInt(req.params.id);

    Booking.find({ user: id }).toArray(async function (err, books) {
      var full = await Promise.all(books.map(async function (book) {
        book.place = await Place.findOne({ _id: book.place }, { projection: { name: 1, address: 1, photos: 1, socials: 1, location: 1, address: 1 }});
        if(book.place.photos) {
          book.place.photo = book.place.photos[0];
          delete book.place.photos;
        }

        if(book.place.socials.instagram !== undefined && book.place.socials.instagram !== null) {
          var match = book.place.socials.instagram.match(/^.*instagram.com\/(.*)\/?.*/i);
          if(match) {
            book.place.instaUser = match[1].replace('/', '');
          } else {
            book.place.instaUser = '';
          }
        }

        var date = moment(book.date + ' ' + book.endTime, 'DD-MM-YYYY HH.mm');
        var tommorow = moment(date.add('1', 'days').format('DD-MM-YYYY'), 'DD-MM-YYYY');
        var diff = tommorow.diff(moment(), 'days');
        if (diff < 0 && !book.closed) {
          Booking.findOneAndUpdate({_id: book._id}, {$set: {closed: true}});
          book.closed = true;
        }

        if (diff < 0) {
          return;
        }

        return book;
      }));
      var newFull = full.filter(function (elem) {
        return elem !== undefined;
      });
      res.json(newFull);
    });
  });

  app.get('/api/user/:id/bookNum', async function (req, res) {
    var num = await Booking.find({ user: parseInt(req.params.id), closed: false, claimed: false }).count();
    res.json({ activeBooks: num });
  });

  // Get the offers belonging to specific User
  app.get('/api/user/:id/offers', function (req, res) {
    var id = parseInt(req.params.id);

    Offer.find({ user: id }).toArray(function (err, offers) {
      res.json(offers);
    });
  });

  // Get the offerPosts belonging to specific User
  app.get('/api/user/:id/offerPosts', function (req, res) {
    var id = parseInt(req.params.id);

    OfferPost.find({ user: id }).toArray(async function (err, posts) {
      var user = await User.findOne({ _id: id }, { projection: { photo: 1, credits: 1, name: 1 }});
      res.json({ posts: posts, user: user });
    });
  });

  // Get all Users Offer Post with a good structure
  app.get('/api/users/offerPosts', function (req, res) {
    User.find({ 'offerPosts.0': { $exists: true }}, { projection: { credits: 1, photo: 1, name: 1, surname: 1 }}).toArray(async function (err, users) {
      var full = await Promise.all(users.map(async function (user) {
        user.posts = await OfferPost.find({ user: user._id }).toArray();
        return user;
      }));
      res.json(full);
    });
  });
};


function editUser(id, newUser, res){
  User.findOne({ _id: id }, function (err, user) {
    err && console.log(err);

    if(!user) {
      res.json({ message: "No such user" });
    } else {
      
      if(newUser.name !== user.name && newUser.name) user.name = newUser.name;
      if(newUser.surname !== user.surname && newUser.surname) user.surname = newUser.surname;
      if(newUser.gender !== user.gender && newUser.gender) user.gender = newUser.gender;
      if(newUser.nationality !== user.nationality && newUser.nationality) user.nationality = newUser.nationality;
      if(newUser.birthDate !== user.birthDate && newUser.birthDate) user.birthDate = newUser.birthDate;
      //if(newUser.email !== user.email && newUser.email) user.email = newUser.email;
      if(newUser.phone !== user.phone && newUser.phone) user.phone = newUser.phone;
      if(newUser.motherAgency !== user.motherAgency && newUser.motherAgency) user.motherAgency = newUser.motherAgency;
      if(newUser.currentAgency !== user.currentAgency && newUser.currentAgency) user.currentAgency = newUser.currentAgency;
      if(newUser.city !== user.city && newUser.city) user.city = newUser.city;
      if(newUser.instagramName !== user.instagramName && newUser.instagramName) user.instagramName = newUser.instagramName;

      // Add a deviceID to the devices array of the User's document
      if(newUser.deviceID) {
        if(user.devices.indexOf(newUser.deviceID) === -1){
          user.devices.push(newUser.deviceID);
        }
      }

      // User can link a referral only if he has not registered yet
      if(newUser.referral && user.newUser) {
        var refCredits = 150;
        User.findOne({ referralCode: newUser.referral }, function(err, us) {
          if(!us) {
            res.json({ message: "Wrong Referral Code" });
          } else {
            if(us._id === user._id){
              res.json({ message: "You cannot be a referral of yourself" });
            } else {
              if(user.referredFrom){
                res.json({ message: "You have already referred" });
              } else {
                user.referredFrom = us._id;
                user.credits += refCredits;
                user.creationDate = moment().format('DD-MM-YYYY');
                user.newUser = false;

                User.replaceOne({ _id: id }, user, function () {
                  res.json({ message: "Profile updated with referral code" });
                });

                User.findOneAndUpdate({ referralCode: newUser.referral },
                  { $push: { referrals: user._id }, $inc: { credits: refCredits }});

                // Send push notifications to all referral code owner's devices
                if(us.devices){
                  sendIos(us.devices, user.name + ' ' + user.surname);
                }
              }
            }
          }
        });
      } else {
        if(user.newUser) user.creationDate = moment().format('DD-MM-YYYY');
        user.newUser = false;
        User.replaceOne({_id: id}, user, function () {
          res.json({ message: "Profile updated" });
        });
      }
    }
  });
}
