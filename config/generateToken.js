var jwt = require('jsonwebtoken');
var config = require('./index');

// Generate an Access Token for the given User ID
function generateAccessToken(userId) {
  var issuer = config.JWTIssuer;
  var audience = config.JWTAudience;
  var secret = config.JWTSecret;

  if(!userId) {
    return false;
  } else {
    return jwt.sign({}, secret, {
      audience: audience,
      issuer: issuer,
      subject: userId.toString()
    });
  }
}

module.exports = {
  generateAccessToken: generateAccessToken
};
