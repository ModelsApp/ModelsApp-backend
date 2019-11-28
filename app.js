require('dotenv').config();
var express = require('express');
var cors = require('cors');
var passport = require('passport');
var config = require('./config/index');
var app = express();
const moment = require('moment');
const fs = require('fs');

const Sentry = require('@sentry/node');
Sentry.init({ dsn: config.sentryUrl });

var db = require('./config/connection');
db.initPool();

var corsOptions = {
  "origin": "*",
  "methods": "GET,PUT,POST,DELETE",
  "allowedHeaders": "Content-Type, Authorization, Content-Length, X-Requested-With"
};

app.use(cors(corsOptions));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(passport.initialize());

try {
  fs.writeFileSync("./logs.txt", 'logs\n', { flag: 'wx' });
} catch (e) { }

const sendgrid = require('./lib/sendGrid');
const CronJob = require('cron').CronJob;
new CronJob('*/30 * * * * *', () => {
  const text = fs.readFileSync('./logs.txt', 'utf8');
  const msg = {
    to: process.env.NOTIFY_EMAIL,
    from: 'models@squaremm.com',
    subject: 'Log files',
    text,
  };
  sendgrid.send(msg);
  fs.unlinkSync('./logs.txt');
  fs.writeFileSync('./logs.txt', 'logs\n', { flag: 'wx' });
}, null, true, 'America/Los_Angeles');

app.use((req, res, next) => {
  const log = `---Request---\n`
    +`${req.originalUrl}\n`
    +`${moment().utc().toISOString()}\n`
    +`${JSON.stringify(req.body)}\n`
    +`${JSON.stringify(req.headers)}\n`
    +`${(req.connection || {}).remoteAddress}\n`
    +`\n---end---`
  fs.appendFileSync('./logs.txt', log, 'utf8');
  next();
});

require('./config/authJWT')(passport);
require('./config/authLocal')(passport);
require('./config/authInstagram')(passport);
require('./config/authGoogle')(passport);
require('./config/authFacebook')(passport);

require('./routes/auth')(app);
require('./routes/user')(app);
require('./routes/admins')(app);
require('./routes/client')(app);
require('./routes/offer')(app);
require('./routes/booking')(app);
require('./routes/intevals')(app);
require('./routes/place')(app);
require('./routes/statistics')(app);
require('./routes')(app);
require('./Views/htmlViews')(app);
require('./routes/samplePost')(app);
require('./routes/campains/campaigns')(app);
require('./routes/campains/userCampaigns')(app);
require('./routes/campains/campaignsIntervals')(app);

var PORT = process.env.PORT || 3000;

app.listen(PORT, '0.0.0.0', function () {
  console.log('Everything is ill right on port %d!', PORT)
});

app.use((err, req, res, next) => {
  console.log('a');
  if (! err) {
      return next();
  }
  let excetpionOpbject = {
    err: err,
    method: req.method,
    path: req.path,
    host: req.host,
    body: req.body
  }
  Sentry.captureException(excetpionOpbject);
  res.status(500).json({message : "Something went wrong!" });
});
