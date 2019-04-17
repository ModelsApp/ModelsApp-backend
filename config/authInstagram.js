var Strategy = require('passport-instagram').Strategy;
var config = require('./index');
var db = require('./connection');
var crypto = require('crypto');

var User;
var Counter;
db.getInstance(function(p_db) {
  User = p_db.collection('users');
  Counter = p_db.collection('counters');
});

module.exports = function(passport) {

  passport.use(
    new Strategy(
      {
        clientID: config.instagramClientID,
        clientSecret: config.instagramClientSecret,
        callbackURL: '/api/auth/instagram/callback',
        passReqToCallback : true
      },
      async function (req, accessToken, refreshToken, profile, done) {
        // Only if user is not authenticated
        if(!req.user){

          // If there is an existing user, check for new data in his Insta profile and update it
          var existingUser = await User.findOne({'instagram.id': profile.id});
          if (existingUser) {

            if(existingUser.photo != profile._json.data.profile_picture ||
              existingUser.instagram.counts.media != profile._json.data.counts.media ||
              existingUser.instagram.counts.followed_by != profile._json.data.counts.followed_by){
              User.findOneAndUpdate(
                {'instagram.id': profile.id},
                { $set: { photo: profile._json.data.profile_picture, 'instagram.counts': profile._json.data.counts}},
                function(err, user){
                  console.log(err);
                  return done(null, user);
                }
              );
            } else{
              return done(null, existingUser);
            }
          } else {
            // If it is the first time for the user - create new user in DB
            var newUser = {};
            newUser.photo = profile._json.data.profile_picture;
            newUser.accepted = false;
            newUser.newUser = true;
            newUser.credits = 200;
            newUser.instagram = {};
            newUser.instagram.id = profile.id;
            newUser.instagram.username = profile.username;
            newUser.instagram.counts = profile._json.data.counts;
            newUser.instagram.full_name = profile._json.data.full_name;
            newUser.referralCode = crypto.randomBytes(2).toString('hex');
            newUser.referredFrom = null;
            newUser.devices = [];
            newUser.plan = {};
            newUser.isAcceptationPending = true;
            newUser.loginTypes = [];
            newUser.loginTypes.push('instagram');
            
            // Update counters. In mongo we need an another collection to store the autoincrement
            Counter.findOneAndUpdate(
              { _id: "userid" },
              { $inc: { seq: 1 } },
              {new: true},
              function(err, seq) {
                if(err) console.log(err);
                newUser._id = seq.value.seq;

                // Insert new user into DB
                User.insertOne( newUser, function(err, user) {
                  console.log("New user inserted");
                  if (err) {
                    console.log(err);
                    return done(err);
                  }
                  console.log(user.ops[0]);
                  return done(null, user.ops[0]);
                });
              }
            );
          }
        } else {
          console.log('request user exist '  + req.user);
          return done(null, false);
        }
      }
    )
  );
};
