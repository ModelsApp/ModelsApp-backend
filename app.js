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

const actionPointsRepository = require('./routes/actionPoints/repository');
const offerRepository = require('./routes/offer/repository');
const userRepository = require('./routes/user/repository');
const placeRepository = require('./routes/place/repository');
const placeTypeRepository = require('./routes/placeType/repository');
const placeExtraRepository = require('./routes/placeExtra/repository');
const placeTimeFrameRepository = require('./routes/placeTimeFrame/repository');
const cityRepository = require('./routes/city/repository');
const bookingRepository = require('./routes/booking/repository');
const intervalRepository = require('./routes/interval/repository');
const driverRepository = require('./routes/driver/repository');
const eventRepository = require('./routes/event/repository');
const driverRideRepository = require('./routes/driverRide/repository');
const eventBookingRepository = require('./routes/eventBooking/repository');
const rideRepository = require('./routes/ride/repository');
const requirementRepository = require('./routes/requirement/repository');

const deleteRide = require('./routes/ride/api/deleteRide');

const functions = require('./config/intervalFunctions');
const placeUtil = require('./routes/place/util');
const bookingUtil = require('./routes/booking/util');
const pushProvider = require('./lib/pushProvider');

async function bootstrap() {
  let client;
  Sentry.init({ dsn: config.sentryUrl });
  await new Promise((resolve, reject) => db.initPool(() => resolve()));
 
  let User, Place, Offer, Counter, Booking, PlaceTimeFrame, City, Driver,
    OfferPost, Interval, SamplePost, ActionPoints, PlaceType, PlaceExtra,
    Event, DriverRide, EventBooking, Ride, Requirement;
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
      Requirement = p_db.collection('requirements');

      client = c;
      resolve();
    });
  });

  const newRequirementRepository = () => requirementRepository(Requirement);
  const newPlaceRepository = () => placeRepository(Place, newRequirementRepository());
  const newEventBookingRepository = () => eventBookingRepository(EventBooking, client, newEventRepository());
  const newActionPointsRepository = () => actionPointsRepository(ActionPoints);
  const newUserRepository = () => userRepository(User);
  const newOfferRepository = () => offerRepository(Offer);
  const newBookingRepository = () => bookingRepository(Booking, newPlaceRepository());
  const newEventRepository = () => eventRepository(Event, newRequirementRepository(), newPlaceRepository());
  const newIntervalRepository = () => intervalRepository(Interval);
  const newPlaceTypeRepository = () => placeTypeRepository(PlaceType);
  const newPlaceExtraRepository = () => placeExtraRepository(PlaceExtra);
  const newPlaceTimeFrameRepository = () => placeTimeFrameRepository(PlaceTimeFrame);
  const newCityRepository = () => cityRepository(City);
  const newRideRepository = () => rideRepository(
    Ride,
    client,
    newDriverRideRepository(),
    newUserRepository(),
    newPlaceRepository(),
  );
  const newDriverRepository = () => driverRepository(Driver);
  const newDriverRideRepository = () => driverRideRepository(DriverRide, rideRepository(Ride));

  const newPlaceUtil = () => placeUtil(
    newBookingRepository(),
    newIntervalRepository(),
    newPlaceTypeRepository(),
    newPlaceExtraRepository(),
  );
  const newBookingUtil = () => bookingUtil(
    Place,
    User,
    Interval,
    Offer,
    Booking,
    newPlaceUtil(),
  );
  const newDeleteRide = () => deleteRide(
    newRideRepository(),
    newDriverRideRepository(),
    newEventBookingRepository(),
  );

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
    newActionPointsRepository(),
    newUserRepository(),
    newOfferRepository(),
    newValidator(),
  );
  require('./routes/booking')(
    app,
    newBookingRepository(),
    newEventBookingRepository(),
    newEventRepository(),
    newPlaceUtil(),
  );
  require('./routes/interval')(app);
  require('./routes/place')(app,
    newPlaceRepository(),
    newPlaceTypeRepository(),
    newPlaceExtraRepository(),
    newPlaceTimeFrameRepository(),
    newCityRepository(),
    newEventRepository(),
    newRequirementRepository(),
    newPlaceUtil(),
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
  require('./routes/actionPoints')(app, newActionPointsRepository(), newValidator());
  require('./routes/placeType')(app, newPlaceTypeRepository(), newValidator());
  require('./routes/placeExtra')(
    app,
    newPlaceExtraRepository(),
    newPlaceTypeRepository(),
    newValidator(),
  );
  require('./routes/placeTimeFrame')(
    app,
    newPlaceTimeFrameRepository(),
    newPlaceTypeRepository(),
    newValidator(),
  );
  require('./routes/city')(
    app,
    newCityRepository(),
    newValidator(),
  );
  require('./routes/driver')(
    app,
    newDriverRepository(),
    newRideRepository(),
    newValidator(),
  );
  require('./routes/event')(
    app,
    newEventRepository(),
    newPlaceRepository(),
    newRequirementRepository(),
    newBookingUtil(),
    newValidator(),
  );
  require('./routes/driverRide')(
    app,
    newDriverRideRepository(),
    newDriverRepository(),
    newRideRepository(),
    newValidator(),
  );
  require('./routes/eventBooking')(
    app,
    newEventBookingRepository(),
    newPlaceRepository(),
    newEventRepository(),
    newBookingRepository(),
    newRideRepository(),
    newUserRepository(),
    newBookingUtil(),
    newDeleteRide(),
    newValidator(),
  );
  require('./routes/ride')(
    app,
    newRideRepository(),
    newDriverRideRepository(),
    newEventBookingRepository(),
    newDriverRepository(),
    newUserRepository(),
    pushProvider,
    newValidator(),
  );
  require('./routes/requirement')(
    app,
    newRequirementRepository(),
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

