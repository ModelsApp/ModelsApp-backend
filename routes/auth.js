var passport = require('passport');
var db = require('../config/connection');
var token = require('../config/generateToken');
var isAuthorized = require('../config/authMiddleware').isAuthorized;
var config = require('./../config/index');
var httpRequest = require('request');
var crypto = require('crypto');
var authEmail = require('../config/authEmail');


var User, Counter;
db.getInstance(function(p_db) {
  User = p_db.collection('users');
  Counter = p_db.collection('counters');
});

function generateUserToken (req, res) {
  var accessToken = token.generateAccessToken(req.user._id);
  if(!accessToken) {
    res.json({ message: "Authentication failed" });
  } else {
    res.json({ message: "Authentication completed", token: accessToken });
  }
}

module.exports = function (app) {

  // Instagram authentication
  app.get(
    '/auth/instagram',
    passport.authenticate('instagram', { session: false })
  );
  // app.get('/api/auth/instagram/callback', function (req, res, next) {
  //   getInstagramToken(req)
  //     .then((response) => {
  //       if(response.statusCode == 200){
  //         var resObj = JSON.parse(response.body);
  //         var profile = resObj.user;
  //         getInstagramUserDetails(resObj.access_token)
  //           .then( async (details)  => {
  //             var profile = JSON.parse(details.body);
  //             if(profile && profile.data){
  //               profile = profile.data;

  //               var existingUser = await User.findOne({'instagram.id': profile.id});
  //               if(existingUser){
  //                 await updateInstagramData(profile);
  //                 res.status(200).json({ message: "Authentication completed", token: token.generateAccessToken(existingUser._id) });
  //               }else{
  //                 createNewUser(profile)
  //                   .then((user) => {
  //                     res.status(200).json({ message: "Authentication completed", token: token.generateAccessToken(user._id) });
  //                   })
  //                   .catch((err) => {
  //                     return res.status(400).json({message: err, token: null});
  //                   })
  //               }
  //             }
  //           })
  //       }else{
  //         return res.status(400).json({message: response.statusMessage, token: null});
  //       }
  //     })
  //     .catch((err) =>{
  //       return res.status(400).json({message: err, token: null});
  //     });
  // });

function updateInstagramData(profile){
  return new Promise( async (resolve, reject) => {
     User.findOneAndUpdate(
        {'instagram.id': profile.id},
        { $set: { photo: profile.profile_picture, 'instagram.counts': profile.counts}}, () => {
          resolve();
        })
  })
}
function createNewUser(profile){
  return new Promise( async (resolve, reject) => {
    var newUser = {};
    newUser.photo = profile.profile_picture;
    newUser.accepted = false;
    newUser.newUser = true;
    newUser.credits = 200;
    newUser.instagram = {};
    newUser.instagram.id = profile.id;
    newUser.instagram.username = profile.username;
    newUser.instagram.counts = profile.counts;
    newUser.instagram.full_name = profile.full_name;
    newUser.referralCode = crypto.randomBytes(2).toString('hex');
    newUser.referredFrom = null;
    newUser.devices = [];
    newUser.plan = {};
    newUser.isAcceptationPending = true;
    newUser._id = await getNewId('userId');
    newUser.loginTypes = [];
    newUser.loginTypes.push('instagram');
    
    User.insertOne( newUser, function(err, user) {
    if (err) {
      reject(err);
    }else{
      resolve(user.ops[0]);
    }
    });
  })
}
function getNewId(type){
  return new Promise((resolve,reject) => {
    Counter.findOneAndUpdate(
      { _id: "userid" },
      { $inc: { seq: 1 } },
      {new: true},
      function(err, seq) {
        if(err) reject(err)
        else resolve(seq.value.seq);
      });
  })
}
function getInstagramToken(req){
  return new Promise((resolve, reject) => {
    var options = {
      url: 'https://api.instagram.com/oauth/access_token',
      method: 'POST',
      form: {
        client_id: config.instagramClientID,
        client_secret: config.instagramClientSecret,
        grant_type: 'authorization_code',
        redirect_uri: 'http://localhost:3000/api/auth/instagram/callback',
        code: req.query.code
      }
    };
    httpRequest(options, async function (error, response, body) {
      if(!error){
        resolve(response);
      }else{
        reject(error);
      }
    });
  });
}
function getInstagramUserDetails(accessToken){
  return new Promise((resolve, reject) => {
    var options = {
      url: `https://api.instagram.com/v1/users/self/?access_token=${accessToken}`,
      method: 'GET'
    };
    httpRequest(options, async function (error, response, body) {
      if(!error){
        resolve(response);
      }else{
        reject(error);
      }
    });
  })
}

  app.get('/api/auth/instagram/callback', function (req, res, next) {
    passport.authenticate('instagram', { session: false, failWithError: true},
      async function (err, user) {
      console.log('Get user from callback');
      console.log(req.params);
      user = await req.user;
      if (err){
        return res.json({ message: err.message, token: null });
      } 
      if (!user) {
        return res.json({ message: "Authentication failed", token: null });
      } else {
        var accessToken = token.generateAccessToken(user._id);
        if(!accessToken) {
          res.json({ message: "Authentication failed", token: null });
        } else {
          res.json({ message: "Authentication completed", token: accessToken });
        }
      }
    })(req, res, next);
  });
  app.post('/api/user',
    passport.authenticate('instagram', { session: false }),
    generateUserToken
  );

  // Google and Facebook authorization can be made only if the user is authenticated
  // It simply connects Google and FB to the user's profile
  app.get('/auth/google', isAuthorized, function (req, res, next) {
    passport.authorize('google', {
      scope: ['profile', 'email'], session: false
    })(req, res, next);
  });
  app.get('/api/auth/google/callback', isAuthorized, function (req, res, next) {
    passport.authorize('google', {
      scope: ['profile', 'email'], session: false
    }, async function (err, user) {
      user = await user;
      if (err) return res.json({ error: err });
      if (!user) return res.json({ message: "Unauthorized" });
      res.json({ message: "Authorized"});
    })(req, res, next);
  });

  app.get('/auth/facebook', isAuthorized, function (req, res, next) {
    passport.authorize('facebook', { session: false })(req, res, next);
  });
  app.get('/api/auth/facebook/callback', isAuthorized, function (req, res, next) {
    passport.authorize('facebook', { session: false }, async function (err, user) {
      user = await user;
      if (err) return res.json({ error: err });
      if (!user) return res.json({ message: "Unauthorized" });
      res.json({ message: "Authorized"})
    })(req, res, next);
  });


  // Local client registration and authentication
  app.post('/api/auth/local/signup', function (req, res, next) {
    passport.authenticate('local-signup', { session: false, failWithError: true },
      async function (err, user) {
        user = await user;
        if (err) return res.json({ message: err.message, token: null });
        if (!user) {
          return res.json({ message: req.authMessage, token: null });
        } else {
          var accessToken = token.generateAccessToken(user._id);
          if(!accessToken) {
            res.json({ message: "Registration failed", token: null });
          } else {
            res.json({ message: "Registration completed", token: accessToken });
          }
        }
      })(req, res, next);
  });
  app.post('/api/auth/local/login', function (req, res, next) {
    passport.authenticate('local-login', { session: false, failWithError: true },
      async function (err, user) {
        user = await user;
        if (err) return res.json({ message: err.message, token: null });
        if (!user) {
          return res.json({ message: req.authMessage, token: null });
        } else {
          var accessToken = token.generateAccessToken(user._id);
          if(!accessToken) {
            res.json({ message: "Authorization failed", token: null });
          } else {
            res.json({ message: "Authorization completed", token: accessToken });
          }
        }
      })(req, res, next);
  });

  app.post('/api/auth/user/signin', authEmail.createUser);

  app.post('/api/auth/user/login', authEmail.loginUser);
};
