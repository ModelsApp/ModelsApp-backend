require('dotenv').config();
const express = require('express');
const cors = require('cors');
const passport = require('passport');
const config = require('./config/index');
const app = express();
const Sentry = require('@sentry/node');

const db = require('./config/connection');
const newValidator = require('./lib/validator');
const ErrorResponse = require('./core/errorResponse');

const newActionPointsRepository = require('./routes/actionPoints/repository');
const newOfferRepository = require('./routes/offer/repository');
const newUserRepository = require('./routes/user/repository');
const newPlaceRepository = require('./routes/place/repository');
const newPlaceTypeRepository = require('./routes/placeType/repository');
const newPlaceExtraRepository = require('./routes/placeExtra/repository');
const newPlaceTimeFrameRepository = require('./routes/placeTimeFrame/repository');
const newCityRepository = require('./routes/city/repository');
const newBookingRepository = require('./routes/booking/repository');
const newIntervalRepository = require('./routes/interval/repository');
const newDriverRepository = require('./routes/driver/repository');
const newEventRepository = require('./routes/event/repository');
const newDriverRideRepository = require('./routes/driverRide/repository');
const newEventBookingRepository = require('./routes/eventBooking/repository');
const newRideRepository = require('./routes/ride/repository');

const functions = require('./config/intervalFunctions');
const newPlaceUtil = require('./routes/place/util');
const newBookingUtil = require('./routes/booking/util');

async function bootstrap() {
  let client;
  Sentry.init({ dsn: config.sentryUrl });
  await new Promise((resolve, reject) => db.initPool(() => resolve()));
 
  let User, Place, Offer, Counter, Booking, PlaceTimeFrame, City, Driver,
    OfferPost, Interval, SamplePost, ActionPoints, PlaceType, PlaceExtra,
    Event, DriverRide, EventBooking, Ride;
  await new Promise((resolve) => {
    db.getInstance((p_db, c) => {
      User = p_db.collection('users');
      Place = p_db.collection('places');
      Offer = p_db.collection('offers');
      Counter = p_db.collection('counters');
      Booking = p_db.collection('bookings');
      OfferPost = p_db.collection('offerPosts');
      Interval = p_db.collection('bookingIntervals');
      SamplePost = p_db.collection('sampleposts');
      ActionPoints = p_db.collection('actionPoints');
      PlaceType = p_db.collection('placeTypes');
      PlaceExtra = p_db.collection('placeExtras');
      PlaceTimeFrame = p_db.collection('placeTimeFrame');
      City = p_db.collection('cities');
      Driver = p_db.collection('drivers');
      Event = p_db.collection('events');
      DriverRide = p_db.collection('driverRides');
      EventBooking = p_db.collection('eventBookings');
      Ride = p_db.collection('rides');

      client = c;
      resolve();
    });
  });

  addMiddlewares(app);

  require('./config/authJWT')(passport);
  require('./config/authLocal')(passport);
  require('./config/authInstagram')(passport);
  require('./config/authGoogle')(passport);
  require('./config/authFacebook')(passport);

  require('./routes/auth')(app);
  require('./routes/user')(app, newValidator());
  require('./routes/admins')(app);
  require('./routes/client')(app);
  require('./routes/offer')(
    app,
    newActionPointsRepository(ActionPoints),
    newUserRepository(User),
    newOfferRepository(Offer),
    newValidator(),
  );
  require('./routes/booking')(
    app,
    newPlaceUtil(
      newBookingRepository(Booking),
      newIntervalRepository(Interval),
      newPlaceTypeRepository(PlaceType),
      newPlaceExtraRepository(PlaceExtra)
    ),
  );
  require('./routes/interval')(app);
  require('./routes/place')(app,
    newPlaceRepository(Place),
    newPlaceTypeRepository(PlaceType),
    newPlaceExtraRepository(PlaceExtra),
    newPlaceTimeFrameRepository(PlaceTimeFrame),
    newCityRepository(City),
    newPlaceUtil(
      newBookingRepository(Booking),
      newIntervalRepository(Interval),
      newPlaceTypeRepository(PlaceType),
      newPlaceExtraRepository(PlaceExtra)
    ),
    newValidator(),
  );
  require('./routes/statistics')(app);
  require('./routes')(app);
  require('./Views/htmlViews')(app);
  require('./routes/samplePost')(app);
  require('./routes/campains/campaigns')(app);
  require('./routes/campains/userCampaigns')(app);
  require('./routes/campains/campaignsIntervals')(app);
  require('./routes/config')(app);
  require('./routes/actionPoints')(app, newActionPointsRepository(ActionPoints), newValidator());
  require('./routes/placeType')(app, newPlaceTypeRepository(PlaceType), newValidator());
  require('./routes/placeExtra')(
    app,
    newPlaceExtraRepository(PlaceExtra),
    newPlaceTypeRepository(PlaceType),
    newValidator(),
  );
  require('./routes/placeTimeFrame')(
    app,
    newPlaceTimeFrameRepository(PlaceTimeFrame),
    newPlaceTypeRepository(PlaceType),
    newValidator(),
  );
  require('./routes/city')(
    app,
    newCityRepository(City),
    newValidator(),
  );
  require('./routes/driver')(
    app,
    newDriverRepository(Driver),
    newValidator(),
  );
  require('./routes/event')(
    app,
    newEventRepository(Event),
    newPlaceRepository(Place),
    newValidator(),
  );
  require('./routes/driverRide')(
    app,
    newDriverRideRepository(DriverRide),
    newDriverRepository(Driver),
    newEventBookingRepository(EventBooking, client),
    newValidator(),
  );
  require('./routes/eventBooking')(
    app,
    newEventBookingRepository(EventBooking, client),
    newEventRepository(Event),
    newUserRepository(User),
    newBookingUtil(
      Place,
      User,
      Interval,
      Offer,
      Booking,
      newPlaceUtil(
        newBookingRepository(Booking),
        newIntervalRepository(Interval),
        newPlaceTypeRepository(PlaceType),
        newPlaceExtraRepository(PlaceExtra)
      ),
    ),
    newValidator(),
  );
  require('./routes/ride')(
    app,
    newRideRepository(Ride),
    newDriverRideRepository(DriverRide),
    newEventBookingRepository(EventBooking, client),
    newDriverRepository(Driver),
    newValidator(),
  );

  addErrorHandling(app);

  functions.checkBookingExpired(db);
  functions.sendReportBookingEmail(db);

  const PORT = process.env.PORT || 3000;

  app.listen(PORT, '0.0.0.0', () => {
    console.log('Everything is ill right on port %d!', PORT);
  });
}

function addMiddlewares(app) {
  const corsOptions = {
    "origin": "*",
    "methods": "GET,PUT,POST,DELETE",
    "allowedHeaders": "Content-Type, Authorization, Content-Length, X-Requested-With, x-custom-header"
  };
  app.use(cors(corsOptions));
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use(passport.initialize());
}

function addErrorHandling(app) {
  app.use((err, req, res, next) => {
    if (!err) {
      return next();
    }
    const exceptionObject = {
      err,
      method: req.method,
      path: req.path,
      host: req.hostname,
      body: req.body,
    }
    Sentry.captureException(exceptionObject);
    if (err instanceof ErrorResponse) {
      return res.status(err.status).json({ message: err.message });
    }
    console.error(err);
    return res.status(500).json({ message: 'Internal server error' });
  });
}

process
  .on('unhandledRejection', (reason, p) => {
    console.error(reason, 'Unhandled Rejection at Promise', p);
  })
  .on('uncaughtException', err => {
    console.error(err, 'Uncaught Exception thrown');
    process.exit(1);
  });

bootstrap();

