require('dotenv').config();
var express = require('express');
var cors = require('cors');
var passport = require('passport');
var app = express();

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
app.use(passport.session());

require('./config/authJWT')(passport);
require('./config/authLocal')(passport);
require('./config/authInstagram')(passport);
// require('./config/authGoogle')(passport);
// require('./config/authFacebook')(passport);



require('./routes/auth')(app);
require('./routes/user')(app);
require('./routes/admins')(app);
require('./routes/client')(app);
require('./routes/offer')(app);
require('./routes/booking')(app);
require('./routes/place')(app);
require('./routes/statistics')(app);
require('./routes')(app);
var functions = require('./config/intervalFunctions');

functions.checkBookingExpired(db);
app.get('/', function(req,res){
  res.json({messsage:"noo"});
});

var PORT = process.env.PORT || 3000;

app.listen(PORT, '0.0.0.0', function () {
  console.log('Everything is ill right on port %d!', PORT) 
});


