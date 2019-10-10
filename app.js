require('dotenv').config();
const express = require('express');
const cors = require('cors');
const passport = require('passport');
const app = express();
const Sentry = require('@sentry/node');
const config = require('./config/');

const Database = require('./config/database');
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
const offerPostsRepository = require('./routes/offer/repository/offerPost');
const eventOfferRepository = require('./routes/eventOffer/repository');

const deleteRide = require('./routes/ride/api/deleteRide');
const deleteEvent = require('./routes/event/api/deleteEvent');
const deleteEventBooking = require('./routes/eventBooking/api/deleteEvent');

const functions = require('./config/intervalFunctions');
const placeUtil = require('./routes/place/util');
const bookingUtil = require('./routes/booking/util');
const pushProvider = require('./lib/pushProvider');
const newEntityHelper = require('./lib/entityHelper');
const calculateDistance = require('./lib/calculateDistance');

async function bootstrap() {
  Sentry.init({ dsn: config.sentryUrl });
  const database = new Database(config);
  const client = await database.getClient();
  const db = await database.getDatabase();
 
  const User = db.collection('users');
  const Place = db.collection('places');
  const Offer = db.collection('offers');
  const Counter = db.collection('counters');
  const Booking = db.collection('bookings');
  const OfferPost = db.collection('offerPosts');
  const Interval = db.collection('bookingIntervals');
  const SamplePost = db.collection('sampleposts');
  const ActionPoints = db.collection('actionPoints');
  const PlaceType = db.collection('placeTypes');
  const PlaceExtra = db.collection('placeExtras');
  const PlaceTimeFrame = db.collection('placeTimeFrame');
  const City = db.collection('cities');
  const Driver = db.collection('drivers');
  const Event = db.collection('events');
  const DriverRide = db.collection('driverRides');
  const EventBooking = db.collection('eventBookings');
  const Ride = db.collection('rides');
  const Requirement = db.collection('requirements');
  const Profile = db.collection('user_profile');
  const OfferPostArchive = db.collection('offerPostArchive');
  const UserPaymentToken = db.collection('userPaymentTokens');
  const Campaign = db.collection('campaigns');
  const UserCampaign = db.collection('userCampaigns');
  const EventOffer = db.collection('eventOffer');
  const CampaignInterval = db.collection("campaignIntervals");

  const entityHelper = newEntityHelper(Counter);

  const newBookingUtil = () => bookingUtil(
    Place,
    User,
    Interval,
    Offer,
    Booking,
    newPlaceUtil(),
    entityHelper,
  );

  const newEventOfferRepository = () => eventOfferRepository(EventOffer);
  const newRequirementRepository = () => requirementRepository(Requirement);
  const newOfferPostRepository = () => offerPostsRepository(OfferPost);
  const newPlaceRepository = () => placeRepository(Place, newRequirementRepository());
  const newEventBookingRepository = () => eventBookingRepository(EventBooking, client, newEventRepository());
  const newActionPointsRepository = () => actionPointsRepository(ActionPoints);
  const newUserRepository = () => userRepository(User, newOfferPostRepository());
  const newOfferRepository = () => offerRepository(Offer);
  const newBookingRepository = () => bookingRepository(Booking, newPlaceRepository());
  const newEventRepository = () => eventRepository(
    Event,
    client,
    newRequirementRepository(),
    newPlaceRepository(),
    newOfferRepository(),
    newIntervalRepository(),
    newBookingUtil(),
  );
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
  const newDeleteRide = () => deleteRide(
    newRideRepository(),
    newDriverRideRepository(),
    newEventBookingRepository(),
  );
  const newDeleteEventBooking = () => deleteEventBooking(
    newEventBookingRepository(),
    newEventRepository(),
    newUserRepository(),
    newBookingUtil(),
    newDeleteRide(),
  );
  const newDeleteEvent = () => deleteEvent(
    newEventRepository(),
    newEventBookingRepository(),
    newDeleteEventBooking(),
  );

  addMiddlewares(app);

  const cloudinary = require('cloudinary').v2
  cloudinary.config({ 
    cloud_name: config.cloudinaryName,
    api_key: config.cloudinaryKey,
    api_secret: config.cloudinarySecret
  });

  require('./config/authJWT')(passport, User, Place);
  require('./config/authLocal')(passport, Place, Counter, User, Interval, entityHelper);
  require('./config/authInstagram')(passport, User, Counter);
  require('./config/authGoogle')(passport, User);
  require('./config/authFacebook')(passport, User);

  require('./routes/auth')(app, User, Profile, entityHelper);
  require('./routes/user')(
    app,
    newValidator(),
    newUserRepository(),
    newBookingRepository(),
    newOfferRepository(),
    User, Offer, Booking, Place, OfferPost, UserPaymentToken, entityHelper);
  require('./routes/admins')(app, User, Place, Offer, OfferPost, Booking, OfferPostArchive);
  require('./routes/client')(app, User, Place, Offer, Counter, Booking, OfferPost, Interval, SamplePost);
  require('./routes/offer')(
    app,
    newActionPointsRepository(),
    newUserRepository(),
    newOfferRepository(),
    newValidator(),
    User, Place, Offer, Interval, Counter, Booking, OfferPost, SamplePost, entityHelper,
  );
  require('./routes/booking')(
    app,
    newPlaceRepository(),
    newUserRepository(),
    newBookingRepository(),
    newEventBookingRepository(),
    newEventRepository(),
    newBookingUtil(),
    User, Place, Offer, Counter, Booking, OfferPost, Interval, SamplePost,
  );
  require('./routes/interval')(app, Interval, Offer);
  require('./routes/place')(app,
    newPlaceRepository(),
    newPlaceTypeRepository(),
    newPlaceExtraRepository(),
    newPlaceTimeFrameRepository(),
    newCityRepository(),
    newEventRepository(),
    newRequirementRepository(),
    newDeleteEvent(),
    newPlaceUtil(),
    newValidator(),
    User, Place, Offer, Counter, Booking, OfferPost, Interval, SamplePost, entityHelper,
  );
  require('./routes/statistics')(app, User, Place, Offer, Counter, Booking, OfferPost, Interval);
  require('./routes')(app, User, Place, Offer, Counter, Booking, OfferPost);
  require('./Views/htmlViews')(app);
  require('./routes/samplePost')(app, Place, SamplePost, entityHelper);
  require('./routes/campains/campaigns')(app, User, Campaign, UserCampaign, CampaignInterval, entityHelper);
  require('./routes/campains/userCampaigns')(app, Campaign, UserCampaign, User, entityHelper);
  require('./routes/campains/campaignsIntervals')(app, Campaign, CampaignInterval, UserCampaign, entityHelper);
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
    newUserRepository(),
    pushProvider,
    calculateDistance,
    newValidator(),
  );
  require('./routes/event')(
    app,
    newEventRepository(),
    newPlaceRepository(),
    newRequirementRepository(),
    newEventOfferRepository(),
    newDeleteEvent(),
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
  require('./routes/eventOffer')(
    app,
    newEventOfferRepository(),
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
  app.use((req, res, next) => {
    console.log('GOT REQUEST BODY: ', req.body);
    next();
  });
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

