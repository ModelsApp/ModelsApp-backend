var FacebookStrategy = require('passport-facebook').Strategy;
var config = require('./index');

module.exports = (passport, User) => {

  // Facebook connecting to account, only if the user is authenticated
  passport.use(new FacebookStrategy({
      clientID: config.facebookClientID,
      clientSecret: config.facebookClientSecret,
      callbackURL: '/api/auth/facebook/callback',
      passReqToCallback : true
    },
    async function(req, token, tokenSecret, profile, done) {

      // If FB account is linked - authorize with it
      var existingUser = await User.findOne({'facebook.id': profile.id});

      if (existingUser) {
        done(null, existingUser);
      } else {

        // If not linked - check if user is authenticated by instagram
        if(req.user){

          // Update the user object in DB with the information from facebook
          var facebook = {};
          facebook.id = profile.id;
          facebook.full_name = profile.displayName;

          User.findOneAndUpdate(
            { _id: parseInt(req.user._id) },
            { $set: { facebook: facebook }, $inc: { credits: 100 }},
            function(err, user){
              return done(null, user);
            }
          );
        } else {
          // If not authenticated - user cannot be logged in by FB
          done(null, false);
        }
      }
    }
  ));
};
