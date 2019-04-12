module.exports = {
  mongoURI: process.env.mongoURI || 'mongodb://shashank_qexon:ajay7868@ds127736.mlab.com:27736/heroku_3zbfm9ff',
  JWTSecret: process.env.JWTSecret || 'secret',
  JWTIssuer: process.env.JWTIssuer || '',
  JWTAudience: process.env.JWTAudience || '',
  instagramClientID: process.env.instagramClientID || '61c6f1e35d5f4f659f312cd1358f13f9',
  instagramClientSecret: process.env.instagramClientSecret || '974491a36ad942c2b417dec09e1c2bd5',
  googleClientID: process.env.googleClientID || '',
  googleClientSecret: process.env.googleClientSecret || '',
  facebookClientID: process.env.facebookClientID || '',
  facebookClientSecret: process.env.facebookClientSecret || '',
};
