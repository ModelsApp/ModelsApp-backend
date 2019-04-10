var GoogleStrategy = require('passport-google-oauth20').Strategy;
var config = require('./index');
var db = require('./connection');

var User;
db.getInstance(function(p_db) {
  User = p_db.collection('users');
});

module.exports = function(passport) {

  // Google connecting to account, only if the user is authenticated
  passport.use(new GoogleStrategy({
      clientID: config.googleClientID,
      clientSecret: config.googleClientSecret,
      callbackURL: '/api/auth/google/callback',
      passReqToCallback : true
    },
    async function(req, token, tokenSecret, profile, done) {

      // If Google account is linked - authorize with it
      var existingUser = await User.findOne({'google.id': profile.id});

      if (existingUser) {
        done(null, existingUser);
      } else {

        if(req.user){

          // Update the user object in DB with the information from Google
          var google = {};
          google.id = profile.id;
          google.full_name = profile.displayName;
          google.email = profile.emails[0].value;

          User.findOneAndUpdate(
            { _id: parseInt(req.user._id) },
            { $set: { google: google }, $inc: { credits: 100 }},
            function(err, user){
              return done(null, user);
            }
          );
        } else {
          // If not authenticated - user cannot be logged in by Google
          done(null, false);
        }
      }
    }
  ));
};
