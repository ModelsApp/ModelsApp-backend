var db = require('../config/connection');
var middleware = require('../config/authMiddleware');
var apn = require('apn');
var moment = require('moment');
var crypto = require('crypto');
var sendGrid = require('../lib/sendGrid');
var bcrypt = require('bcrypt-nodejs');
var imageUplader = require('../lib/imageUplader');
var multiparty = require('multiparty');
var pushProvider = require('../lib/pushProvider');
var path = require('path');
var entityHelper = require('../lib/entityHelper');

var User, Booking, Offer, Place, OfferPost, UserPaymentToken;
db.getInstance(function (p_db) {
  User = p_db.collection('users');
  Offer = p_db.collection('offers');
  Booking = p_db.collection('bookings');
  Place = p_db.collection('places');
  OfferPost = p_db.collection('offerPosts');
  UserPaymentToken = p_db.collection('userPaymentTokens');
});

module.exports = function(app) {

  // Get the current (authenticated) User
  app.get('/api/user/current', middleware.isAuthorized, async function (req, res) {
    var user = await req.user;
    res.json(user);
  });
  app.post('/api/user/paymentToken', middleware.isAuthorized, async function(req, res){
    let id = req.body.id;
    let token = req.body.token;
    let user = await req.user;
    if(id && token && user){
      let userPaymentToken = {
        _id: await entityHelper.getNewId('userPaymentTokenId'),
        id: id,
        token: token,
        userId: user._id
      }
      await UserPaymentToken.insertOne(userPaymentToken);
      res.status(200).json(await getPaymentTokens(user._id));
    }else{
      res.status(400).json({message: "invalid parameters"});
    }
  });
  getPaymentTokens = async (userId) => {
    let tokens =  await UserPaymentToken.find({userId: userId }).toArray();
    return tokens.map(x=> {
      delete x._id;
      delete x.userId;
      return x;
    });
  }
  app.get('/api/user/paymentToken', middleware.isAuthorized, async function(req, res){
    let user =  await req.user;
    if(user){
      res.status(200).json(await getPaymentTokens(user._id));
    }else{
      res.status(400).json({message: "invalid parameters"});
    }
  });
  app.get('/api/user/paymentStatus', middleware.isAuthorized, async function(req, res){
    let user =  await req.user;
    if(user){
      res.status(200).json({ isPaymentRequired: user.isPaymentRequired });
    }else{
      res.status(400).json({message: "invalid parameters"});
    }
  });
  app.put('/api/user/paymentStatus', middleware.isAuthorized, async function(req, res){
    let user =  await req.user;
    let isPaymentRequired = req.body.isPaymentRequired;
    if(user){
      await User.findOneAndUpdate({_id: user._id, $set: { isPaymentRequired: isPaymentRequired }});
      res.status(200).json({message: 'ok'});
    }else{
      res.status(400).json({message: "invalid parameters"});
    }
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

  app.put('/api/user/:id/device', async (req,res) => {
    let id = parseInt(req.params.id);
    let uid = req.body.uid;
    let newToken = req.body.newToken;
    let oldToken = req.body.oldToken;
    if(id){
      let user =  await User.findOne({ _id: id });
      if(user){
        let foundDevices  = user.devices.filter(x => {
          if((typeof x === Object || typeof x == 'object') && x.type.toLowerCase() == 'android' && x.uid == uid) return true;
          else return false;
        });
        //new device that was not use before
        if(foundDevices.length == 0){
        let newDevice = {
            type: 'android',
            uid: uid,
            token: newToken,
            changedAt: moment().format('YYYY-MM-DD HH:mm:ss')
           };
        await User.findOneAndUpdate({_id: user._id}, { $push :{ devices : newDevice } } )
        }else{
          await User.findOneAndUpdate({_id: user._id}, 
            { $set :{ 'devices.$[t].token' : newToken, 'devices.$[t].changedAt': moment().format('YYYY-MM-DD HH:mm:ss') } },
            { arrayFilters: [ {"t.uid": uid , "t.token": oldToken } ]} );
        }
      res.status(200).json({message: "ok"});
      }else{
        res.status(404).json({message:  "user not found"});
      }
    }else{
      res.status(400).json({message:  "invalid parameters"});
    }
  });

  // Get the bookings belonging to specific User
  app.get('/api/user/:id/bookings', function (req, res) {
    var id = parseInt(req.params.id);

    Booking.find({ user: id }).toArray(async function (err, books) {
      var full = await Promise.all(books.map(async function (book) {
        book.place = await Place.findOne({ _id: book.place }, { projection: { name: 1, address: 1, photos: 1, socials: 1, location: 1, address: 1, mainImage: 1 }});
        if(book.place){
          if(book.place.photos) {
            book.place.photo = book.place.mainImage;
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
        }else{
          book.place = {};
          book.place.photo = '';
          book.place.instaUser ='';
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
    if(id){
      OfferPost.find({ user: id }).toArray(async function (err, posts) {
        var user = await User.findOne({ _id: id }, { projection: { photo: 1, credits: 1, name: 1 }});
        res.json({ posts: posts, user: user });
      });
    }else{
      res.status(400).json({message: 'invalid parameter'})
    }
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

  app.get('/api/user/:id/confirm/:hash', async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const hash = req.params.hash;
      if (!id || !hash) {
        return res.status(403).json({ message: "Couldn't confirm user" });
      }
      const user = await User.findOneAndUpdate(
        { _id : id, isEmailAcceptationPending: true, confirmHash : hash }, 
        { $set : { isEmailAcceptationPending : false, confirmHash: null } },
        { new: true });
      if (!user || !user.value) {
        return res.status(404).json({ message: 'Something went wrong :(' });
      }
      const filePath = path.join(__dirname, '../htmlTemplates/userConfirmed.html');

      return res.status(200).sendFile(filePath);
    } catch (error) {
      console.log(error);
      return res.status(500).json({ message: 'Something went wrong :(' });
    }
  });

  app.post('/api/user/forgotPassword', async (req,res) => {
    var email = req.body.email;
    if(email){
      var temporaryPassword = crypto.randomBytes(2).toString('hex');
      User.findOneAndUpdate({email:  email }, 
        { $set: { temporaryPassword : bcrypt.hashSync(temporaryPassword, bcrypt.genSaltSync(8), null) } }, 
        { new: true, returnOriginal: false } )
        .then(async (user) => {
          await sendGrid.sendForgotPasswordEmail(temporaryPassword, user.value);
          res.status(200).json({message: 'check your email'});
        })
        .catch((err) => {
          res.status(404).json({message: 'user not found'});
        });
    }else{
      res.status(400).json({message: 'invalid parameters'});
    }
  });
  //change password after login with temporary password
  //body: password, confirmPassword, temporaryPassword
  app.post('/api/user/changePassword', middleware.isAuthorized, async (req, res) => {
    var user = await req.user;
    if(user){
      var password = req.body.password;
      var confirmPassword = req.body.confirmPassword;
      if(password && confirmPassword && password == confirmPassword){
        User.findOneAndUpdate({_id: user._id }, 
          { $set: { temporaryPassword : null, password : bcrypt.hashSync(password, bcrypt.genSaltSync(8), null) } }, 
          { new: true, returnOriginal: false } )
          .then((user) => {
            return res.status(200).json({message: "password has been updated"});
          })
          .catch((err) => {
            res.status(404).json({message: 'user not found'});
          });
      }else{
        res.status(400).json({message: 'invalid parameters'});
      }
    }else{
      res.status(400).json({message: 'User not authorize'});
    }
  });
  app.post('/api/user/changeCurrentPassword', middleware.isAuthorized, async (req, res) => {
    var user = await req.user;
    if(user){
      var password = req.body.password;
      var newPassword = req.body.newPassword;
      var newConfirmPassword = req.body.newConfirmPassword;
      if(password && newPassword && newConfirmPassword && newPassword == newConfirmPassword && bcrypt.compareSync(password, user.password)){
          
        User.findOneAndUpdate({_id: user._id }, 
          { $set: { password : bcrypt.hashSync(newPassword, bcrypt.genSaltSync(8), null) } }, 
          { new: true, returnOriginal: false } )
          .then((user) => {
            return res.status(200).json({message: "password has been updated"});
          })
          .catch((err) => {
            res.status(404).json({message: 'user not found'});
          });
      }else{
        res.status(400).json({message: 'invalid parameters'});
      }
    }else{
      res.status(400).json({message: 'User not authorize'});
    }
  });
  app.delete('/api/user/:id/images', async (req,res) => {
    var id = parseInt(req.params.id);
    var imageId = req.body.imageId || req.query.imageId;
    if(id){
      var user = await User.findOne({ _id : id });
      if(user){
        var image = user.images.find( x=>x.id == imageId);
        if(image){
          await imageUplader.deleteImage(image.cloudinaryId)
          .then(() => {
            User.findOneAndUpdate({_id: id}, { $pull: { 'images' : { 'id': image.id } }})
              .then(async () => {
                if(user.mainImage == image.url){
                  await User.findOneAndUpdate({_id: id }, {$set: { mainImage:  null } })
                }
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
        res.status(404).json({message : "Image is for the wrong user"});
      }
      }else{
        res.status(404).json({message : "user not found"});
      }
    }else{
      res.status(404).json({message : "invalid parameters"});
    }
    
  });
  app.post('/api/user/:id/images', async (req,res) => {
    var id = parseInt(req.params.id);
    if(id){
      var user = await User.findOne({ _id : id });
      if(user){
      var form = new multiparty.Form();
      form.parse(req, async function (err, fields, files) {
        if(files){
          files = files.images;
          var addedImages = [];
          for (file of files) {
            await imageUplader.uploadImage(file.path, 'users', user._id)
              .then(async (newImage) =>{
                await User.findOneAndUpdate({ _id: id }, { $push: { images: newImage } })
                addedImages.push(newImage);
              })
              .catch((err) => {
                console.log(err);
              });
          }
          res.status(200).json({message: "ok", images: addedImages});
        }else{
          res.status(400).json({message:  'no files added'});
        }
        
      });
    }else{
      res.status(404).json({message : "offer not found" });
    }
    }else{
      res.status(404).json({message : "invalid parameters"});
      }
  });
  app.put('/api/user/:id/images/:imageId/main', async (req,res) => {
    var id = parseInt(req.params.id);
    var imageId = req.params.imageId;
    if(id && imageId){
      var user = await User.findOne({ _id : id });
      if(user && user.images && user.images.find( x=>x.id == imageId)){
        await User.findOneAndUpdate({ _id : id }, {$set : { 'images.$[].isMainImage': false } } );
        var image = user.images.find( x=>x.id == imageId);
        await User.findOneAndUpdate({ _id : id }, 
          { $set : { mainImage : image.url, 'images.$[t].isMainImage' : true }},
          { arrayFilters: [ {"t.id": imageId  } ] }
          )
          res.status(200).json({message: "ok"});
      }else{
        res.status(404).json({message : "user not found"});
      }
    }else{
      res.status(404).json({message : "invalid parameters"});
    }
  });
    // Delete specific User permanent
  // not handle flag anywhere in system
  app.delete('/api/user/:id/permanent', function (req, res) {
    var id = parseInt(req.params.id);
    if(id){
      User.deleteOne({ _id : id })
        .then(() => {
          Booking.deleteMany({user: id  })
            .then(() => {
              OfferPost.deleteMany({ user: id }).then(() => {
                res.status(200).json({message: "user deleted permanentnly"});
              });
            })
      })
    }else{
       res.status(400).json({message: "invalid parameter"});
    }
  });
};



function editUser(id, newUser, res){
  User.findOne({ _id: id }, function (err, user) {
    err && console.log(err);

    if(!user) {
      res.json({ message: "No such user" });
    } else {
      
      if(newUser.registerStep !== user.registerStep && newUser.registerStep) user.registerStep = newUser.registerStep;
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
      if(newUser.referral && !user.referredFrom) {
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
                  pushProvider.sendReferralINotification(us.devices, user.name + ' ' + user.surname)
                    .then(() => {
                      
                    });
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
