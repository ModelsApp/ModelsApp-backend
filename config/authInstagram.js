var Strategy = require('passport-instagram').Strategy;
var config = require('./index');
var crypto = require('crypto');
const { SUBSCRIPTION } = require('./constant');

module.exports = (passport, User, Counter) => {

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
            const newUser = {
              photo: profile._json.data.profile_picture,
              accepted: false,
              newUser: true,
              credits: 200,
              instagram: {
                id: profile.id,
                username: profile.username,
                counts: profile._json.data.counts,
                full_name: profile._json.data.full_name,
              },
              referralCode: crypto.randomBytes(2).toString('hex'),
              referredFrom: null,
              devices: [],
              isAcceptationPending: true,
              loginTypes: ['instagram'],
              level: 1,
              action_counters: {},
              action_total_counter: 0,
              subscriptionPlan: { subscription: SUBSCRIPTION.trial },
            };
            
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
