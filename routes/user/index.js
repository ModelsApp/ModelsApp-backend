const path = require('path');
const moment = require('moment');
const crypto = require('crypto');
const bcrypt = require('bcrypt-nodejs');
const multiparty = require('multiparty');

const middleware = require('../../config/authMiddleware');
const sendGrid = require('../../lib/sendGrid');
const imageUplader = require('../../lib/imageUplader');
const pushProvider = require('../../lib/pushProvider');
const newPostSubscriptionSchema = require('./schema/postSubscription');
const newEditUserSchema = require('./schema/editUser');
const newEditUserAdminSchema = require('./schema/editUserAdmin');
const ErrorResponse = require('./../../core/errorResponse');
const { SUBSCRIPTION } = require('./../../config/constant');

module.exports = (app, validate, userRepository, User, Offer, Booking, Place, OfferPost, UserPaymentToken, getNewId) => {

  // Get the current (authenticated) User
  app.get('/api/user/current', middleware.isAuthorized, async (req, res, next) => {
    try {
      const user = await req.user;
      return res.status(200).json(user);
    } catch (error) {
      return next(error);
    }
  });

  app.post('/api/user/paymentToken', middleware.isAuthorized, async (req, res, next) => {
    try {
      const { id, token } = req.body;
      const user = await req.user;
      if (id && token && user) {
        const userPaymentToken = {
          _id: await getNewId('userPaymentTokenId'),
          id,
          token,
          userId: user._id
        }
        await UserPaymentToken.insertOne(userPaymentToken);
        return res.status(200).json(await getPaymentTokens(user._id));
      } else {
        throw ErrorResponse.BadRequest('invalid parameters');
      }
    } catch (error) {
      return next(error);
    }
  });

  getPaymentTokens = async (userId) => {
    const tokens = await UserPaymentToken.find({ userId }).toArray();

    return tokens.map(token => {
      delete token._id;
      delete token.userId;
      return token;
    });
  }

  app.get('/api/user/paymentToken', middleware.isAuthorized, async (req, res, next) => {
    try {
      const user = await req.user;

      return res.status(200).json(await getPaymentTokens(user._id));
    } catch (error) {
      return next(error);
    }
  });

  app.get('/api/user/paymentStatus', middleware.isAuthorized, async (req, res, next) => {
    try {
      const user = await req.user;

      return res.status(200).json({ isPaymentRequired: user.isPaymentRequired });
    } catch (error) {
      return next(error);
    }
  });

  app.put('/api/user/paymentStatus', middleware.isAuthorized, async (req, res, next) => {
    try {
      const user = await req.user;
      const { isPaymentRequired } = req.body;
      await User.findOneAndUpdate({ _id: user._id }, { $set: { isPaymentRequired } });
  
      return res.status(200).json({ message: 'ok' });
    } catch (error) {
      return next(error);
    }
  });

  // Get specific user
  app.get('/api/user/:id', async (req, res, next) => {
    try {
      const id = parseInt(req.params.id);
      const user = await User.findOne({ _id: id });
  
      if (!user) {
        return res.status(404).json({ message: 'No such user' });
      }
  
      return res.status(200).json(user);
    } catch (error) {
      return next(error);
    }
  });
  
  // Get Users by specific query
  app.get('/api/user', async (req, res, next) => {
    try {
      const query = {};
      if(req.body.id) query._id = parseInt(req.body.id);
      if(req.body.name) query.name = req.body.name;
  
      const users = await User.find(query).toArray();
      if (!users.length) {
        return res.status(404).json({ message: "No users found" });
      }

      return res.status(200).json(users);
    } catch (error) {
      return next(error);
    }
  });

  // Delete specific User
  // not handle flag anywhere in system
  app.delete('/api/user/:id', async (req, res, next) => {
    try {
      const user = await User.findOneAndUpdate({ _id: parseInt(req.params.id) }, { $set: { deleted: true } });
      if (!user) {
        return res.status(404).json('No such user');
      }
      return res.status(200).json({ message: 'user deleted' }); 
    } catch (error) {
      return next(error);
    }
  });

  // Add a subscription to the user
  app.put('/api/user/subscription', middleware.isAuthorized, async (req, res, next) => {
    try {
      const user = await req.user;
      const validation = validate(req.body, newPostSubscriptionSchema());
      if (validation.error) {
        throw ErrorResponse.BadRequest(validation.error);
      }
  
      const { subscription, months } = req.body;
      let subscriptionPlan;
      if (subscription === SUBSCRIPTION.trial || subscription === SUBSCRIPTION.unlimited) {
        subscriptionPlan = {
          subscription,
        };
      } else {
        subscriptionPlan = {
          subscription,
          paidAt: moment().toISOString(),
          dueTo: moment().add(months, 'M').toISOString(),
        };
      }
  
      await User.findOneAndUpdate({ _id: user._id }, { $set: { subscriptionPlan } });
      return res.status(200).json(subscriptionPlan);
    } catch (error) {
      return next(error);
    }
  });

  // Edit Current (authenticated) User
  app.put('/api/user/current', middleware.isAuthorized, async (req, res, next) => {
    try {
      const newUser = req.body;
      const validation = validate(newUser, newEditUserSchema());
      if (validation.error) {
        throw ErrorResponse.BadRequest(validation.error);
      }
      const user1 = await req.user;
  
      editUser(parseInt(user1._id), newUser, res);
    } catch (error) {
      return next(error);
    }
  });

  app.put('/api/admin/user', middleware.isAdmin, async (req, res, next) => {
    try {
      const newUser = req.body;
      const validation = validate(newUser, newEditUserAdminSchema());
      if (validation.error) {
        throw ErrorResponse.BadRequest(validation.error);
      }
  
      editUser(parseInt(req.body.userId), newUser, res);
    } catch (error) {
      return next(error);
    }
  });

  // Edit specific User
  app.put('/api/user/:id', (req, res, next) => {
    try {
      const id = parseInt(req.params.id);
      const newUser = req.body;
      const validation = validate(newUser, newEditUserSchema());
      if (validation.error) {
        throw ErrorResponse.BadRequest(validation.error);
      }
  
      editUser(id, newUser, res);
    } catch (error) {
      return next(error);
    }
  });

  app.put('/api/user/:id/device', async (req, res, next) => {
    try {
      const id = parseInt(req.params.id);
      const { uid, newToken, oldToken } = req.body;
      if (!id) {
        throw ErrorResponse.BadRequest('provide valid id');
      }
      const user = await User.findOne({ _id: id });
      if (!user || !user.devices) {
        throw ErrorResponse.NotFound('user not found');
      }
      const foundDevices = user.devices.filter(x => {
        if ((typeof x === Object || typeof x == 'object') && x.type.toLowerCase() == 'android' && x.uid == uid) return true;
        return false;
      });
      //new device that was not use before
      if (!foundDevices.length) {
        const newDevice = {
          type: 'android',
          uid: uid,
          token: newToken,
          changedAt: moment().format('YYYY-MM-DD HH:mm:ss'),
        };
        await User.findOneAndUpdate({ _id: user._id }, { $push: { devices: newDevice } } );
      } else {
        await User.findOneAndUpdate({ _id: user._id }, 
          { $set: { 'devices.$[t].token': newToken, 'devices.$[t].changedAt': moment().format('YYYY-MM-DD HH:mm:ss') } },
          { arrayFilters: [ { 't.uid': uid , 't.token': oldToken } ] } );
      }

      return res.status(200).json({ message: 'ok' });
    } catch (error) {
      return next(error);
    }
  });

  // Get the bookings belonging to specific User
  app.get('/api/user/:id/bookings', async (req, res, next) => {
    try {
      const id = parseInt(req.params.id);

      const bookings = await Booking.find({ user: id }).toArray();
      const full = await Promise.all(bookings.map(async (booking) => {
        booking.place = await Place.findOne(
          { _id: booking.place },
          { projection:
            { name: 1,
              address: 1,
              photos: 1,
              socials: 1,
              location: 1,
              address: 1,
              mainImage: 1,
            },
        });
        if (!booking.place) {
          booking.place = {};
          booking.place.photo = '';
          booking.place.instaUser ='';
        }
        if(booking.place.photos) {
          booking.place.photo = booking.place.mainImage;
          delete booking.place.photos;
        }
  
        if((booking.place.socials || {}).instagram !== undefined && (booking.place.socials || {}).instagram !== null) {
          const match = booking.place.socials.instagram.match(/^.*instagram.com\/(.*)\/?.*/i);
          if(match) {
            booking.place.instaUser = match[1].replace('/', '');
          } else {
            booking.place.instaUser = '';
          }
        }
  
        const date = moment(booking.date + ' ' + booking.endTime, 'DD-MM-YYYY HH.mm');
        const tommorow = moment(date.add('1', 'days').format('DD-MM-YYYY'), 'DD-MM-YYYY');
        const diff = tommorow.diff(moment(), 'days');
        if (diff < 0 && !booking.closed) {
          await Booking.findOneAndUpdate({ _id: booking._id }, { $set: { closed: true } });
          booking.closed = true;
        }
  
        if (diff < 0) {
          return;
        }
  
        return booking;
      }));
  
      return res.status(200).json(full.filter(elem => elem));
    } catch (error) {
      return next(error);
    }
  });

  app.get('/api/user/:id/bookNum', async (req, res, next) => {
    try {
      const num = await Booking.find({ user: parseInt(req.params.id), closed: false, claimed: false }).count();
      return res.status(200).json({ activeBooks: num });
    } catch (error) {
      return next(error);
    }
  });

  // Get the offers belonging to specific User
  app.get('/api/user/:id/offers', async (req, res, next) => {
    try {
      const id = parseInt(req.params.id);

      const offers = await Offer.find({ user: id }).toArray();
      return res.status(200).json(offers);
    } catch (error) {
      return next(error);
    }
  });

  app.get('/api/users/offerPosts', async (req, res, next) => {
    try {
      let { limit = 10, page = 1, userId } = req.query;

      if (userId) {
        userId = parseInt(userId);
        let user = await userRepository.findById(userId);
        user = await userRepository.joinOfferPosts(user, false);

        return res.status(200).json(user);
      }
      limit = parseInt(limit);
      page = parseInt(page);

      let users = await userRepository.findPaginatedUsers(limit, page, ['_id', 'name', 'email', 'level', 'photo']);
      users = await Promise.all(users.map(user => userRepository.joinOfferPosts(user, 5)));

      return res.status(200).json(users);
    } catch (error) {
      return next(error);
    }
  });

  app.get('/api/user/:id/confirm/:hash', async (req, res, next) => {
    try {
      const id = parseInt(req.params.id);
      const hash = req.params.hash;
      if (!id || !hash) {
        throw ErrorResponse.BadRequest('invalid parameters');
      }
      const user = await User.findOneAndUpdate(
        { _id : id, isEmailAcceptationPending: true, confirmHash : hash }, 
        { $set : { isEmailAcceptationPending : false, confirmHash: null } },
        { new: true });
      if (!user || !user.value) {
        throw ErrorResponse.NotFound();
      }
      const filePath = path.join(__dirname, '../htmlTemplates/userConfirmed.html');

      return res.status(200).sendFile(filePath);
    } catch (error) {
      return next(error);
    }
  });

  app.post('/api/user/forgotPassword', async (req, res, next) => {
    try {
      const { email } = req.body;
      if (!email) {
        throw ErrorResponse.BadRequest('provide email');
      }
      const temporaryPassword = crypto.randomBytes(2).toString('hex');
      const user = await User.findOneAndUpdate(
        { email }, 
        { $set: { temporaryPassword : bcrypt.hashSync(temporaryPassword, bcrypt.genSaltSync(8), null) } }, 
        { new: true, returnOriginal: false });
      if (!user || !user.value) {
        throw ErrorResponse.NotFound('User not found');
      }
      await sendGrid.sendForgotPasswordEmail(temporaryPassword, user.value);
      return res.status(200).json({ message: 'check your email' });
    } catch (error) {
      return next(error);
    }
  });

  //change password after login with temporary password
  //body: password, confirmPassword, temporaryPassword
  app.post('/api/user/changePassword', middleware.isAuthorized, async (req, res, next) => {
    try {
      const user = await req.user;
      const { password, confirmPassword } = req.body;
      if (!user.temporaryPassword) {
        throw ErrorResponse.Unauthorized();
      }
      if (!password || !confirmPassword || password !== confirmPassword) {
        throw ErrorResponse.BadRequest('passwords dont match');
      }
      const updatedUser = await User.findOneAndUpdate(
        { _id: user._id }, 
        { $set: { temporaryPassword : null, password : bcrypt.hashSync(password, bcrypt.genSaltSync(8), null) } }, 
        { new: true, returnOriginal: false });
      if (!updatedUser || !updatedUser.value) {
        throw ErrorResponse.NotFound('User not found');
      }
      return res.status(200).json({ message: 'password has been updated' });
    } catch (error) {
      return next(error);
    }
  });

  app.post('/api/user/changeCurrentPassword', middleware.isAuthorized, async (req, res, next) => {
    try {
      const user = await req.user;
      const { password, newPassword, newConfirmPassword } = req.body;
      if (!password
        || !newPassword
        || !newConfirmPassword
        || newPassword !== newConfirmPassword
        || !bcrypt.compareSync(password, user.password)) {
          throw ErrorResponse.BadRequest('invalid parameters');
        }
      const updatedUser = await User.findOneAndUpdate(
        {_id: user._id }, 
        { $set: { password : bcrypt.hashSync(newPassword, bcrypt.genSaltSync(8), null) } }, 
        { new: true, returnOriginal: false });
      if (!updatedUser || !updatedUser.value) {
        throw ErrorResponse.NotFound('User not found');
      }
      return res.status(200).json({ message: 'password has been updated' });
    } catch (error) {
      return next(error);
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

  function editUser(id, newUser, res) {
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
        if(newUser.level !== user.level && user.level) user.level = newUser.level;
        if(user.admin !== undefined) user.admin = newUser.admin;
        if(newUser.driver !== undefined) user.driver = newUser.driver;
        if(newUser.driverCaptain !== undefined) user.driverCaptain = newUser.driverCaptain;
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
};
