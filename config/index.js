module.exports = {
  mongoURI: process.env.mongoURI || 'mongodb://shashank_qexon:ajay7868@ds127736.mlab.com:27736/heroku_3zbfm9ff',
  JWTSecret: process.env.JWTSecret || 'secret',
  JWTIssuer: process.env.JWTIssuer || '',
  JWTAudience: process.env.JWTAudience || '',
  instagramClientID: process.env.instagramClientID || '53eb44751147431aa6604980d97114b8',
  instagramClientSecret: process.env.instagramClientSecret || '848e2c083fdd4f53a171dbcfa88bd7be',
  googleClientID: process.env.googleClientID || '',
  googleClientSecret: process.env.googleClientSecret || '',
  facebookClientID: process.env.facebookClientID || '',
  facebookClientSecret: process.env.facebookClientSecret || '',
};
