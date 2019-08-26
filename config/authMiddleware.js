const passport = require('passport');

const ErrorResponse = require('./../core/errorResponse');

module.exports = {
  isAuthorized: function (req, res, next) {
    return passport.authenticate('jwt', { session: false }, function (err, user) {
      if (err) return next(err);
      if (!user){
        res.status(403).json({ message: "Not authenticated" });
      } else {
        req.user = user;
        next();
      }
    })(req, res, next);
  },

  isClient: function(req, res, next) {
    return passport.authenticate('jwt-client', { session: false }, function (err, client) {
      if (err) return next(err);
      if (!client){
        res.json({ message: "Not a client" });
      } else {
        req.user = client;
        next();
      }
    })(req, res, next);
  },

  isDriver: (req, res, next) => {
    return passport.authenticate('jwt', { session: false }, (err, user) => {
      if (err) {
        throw ErrorResponse.Internal();
      }
      try {
        if (!user || !user.driver) {
          throw ErrorResponse.Unauthorized();
        }
        req.user = user;
        return next();
      } catch (e) {
        return next(e);
      }
    })(req, res, next);
  },

  isDriverCaptain: (req, res, next) => {
    return passport.authenticate('jwt', { session: false }, (err, user) => {
      if (err) {
        throw ErrorResponse.Internal();
      }
      try {
        if (!user || !user.driverCaptain) {
          throw ErrorResponse.Unauthorized();
        }
        req.user = user;
        return next();
      } catch (e) {
        return next(e);
      }
    })(req, res, next);
  },

  isAdmin: function (req, res, next) {
    return passport.authenticate('jwt', { session: false }, async function (err, user) {
      if (err) return next(err);
      user = await user;
      if (!user){
        res.json({ message: "Not authenticated" });
      } else {
        if(user.admin === true){
          req.user = user;
          next();
        } else {
          res.json({ isAdmin: false });
        }
      }
    })(req, res, next);
  }
};
