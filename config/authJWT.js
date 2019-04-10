var Strategy = require('passport-jwt').Strategy;
var ExtractJwt = require('passport-jwt').ExtractJwt;
var config = require('./index');
var db = require('./connection');

var User, Place;
db.getInstance(function(p_db) {
  User = p_db.collection('users');
  Place = p_db.collection('places');
});

var JWTOptions = {
  jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
  secretOrKey: config.JWTSecret,
  issuer: config.JWTIssuer,
  audience: config.JWTAudience,
};

module.exports = function(passport){

  passport.use(new Strategy(JWTOptions, async function (payload, done) {
    var existingUser = await User.findOne({ _id: parseInt(payload.sub) });
    if (existingUser) {
      return done(null, existingUser, payload);
    }else{
      return done(null, false);
    }
  }));

  passport.use("jwt-client", new Strategy(JWTOptions, async function (payload, done) {
    var existingUser = await Place.findOne({ _id: parseInt(payload.sub) });
    if (existingUser) {
      return done(null, existingUser, payload);
    }else{
      return done(null, false);
    }
  }));
};

