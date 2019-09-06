const _ = require('lodash');

const postSchema = require('./schema/post');
const selectOneSchema = require('./schema/selectOne');
const acceptRideSchema = require('./schema/acceptRide');
const editRideSchema = require('./schema/editRide');
const middleware = require('../../config/authMiddleware');
const newDeleteRide = require('./api/deleteRide');
const ErrorResponse = require('./../../core/errorResponse');
const newPostRide = require('./api/postRide');
const newAcceptRide = require('./api/acceptRide');
const newValidateDriverRide = require('./api/acceptRide/validateDriverRide');
const newHandleRelations = require('./api/acceptRide/handleRelations');
const { MAX_RIDE_CHANGES } = require('./constant');

module.exports = (
  app,
  rideRepository,
  driverRideRepository,
  eventBookingRepository,
  driverRepository,
  userRepository,
  pushProvider,
  validate,
) => {
  app.post('/api/ride', middleware.isAuthorized, async (req, res, next) => {
    try {
      const user = await req.user;

      const validation = validate(req.body, postSchema);
      if (validation.error) {
        throw ErrorResponse.BadRequest(validation.error);
      }
  
      const result = await newPostRide(
        rideRepository, driverRideRepository, eventBookingRepository,
      )(req.body, user._id);
  
      return res.status(201).send(result);
    } catch (error) {
      return next(error);
    }
  });

  app.post('/api/ride/add-passenger', middleware.isDriver, async (req, res, next) => {
    try {
      const user = await req.user;

      const validation = validate(req.body, postSchema);
      if (validation.error) {
        throw ErrorResponse.BadRequest(validation.error);
      }
      let result;

      await eventBookingRepository.transaction(async () => {
        result = await newPostRide(
          rideRepository, driverRideRepository, eventBookingRepository,
        )(req.body, user._id, false, user.driver);
        const ride = await rideRepository.findById(result._id);
        const driverRide = await driverRideRepository.findById(ride.driverRideId);
        await newValidateDriverRide(driverRepository, rideRepository)(driverRide, user.driver)
        await newHandleRelations(rideRepository, driverRideRepository)(ride._id, user.driver, ride);
      });
  
      return res.status(201).send(result);
    } catch (error) {
      return next(error);
    }
  });

  app.get('/api/ride', middleware.isAuthorized, async (req, res) => {
    const user = await req.user;

    const { id, pending, filter } = req.query;

    const query = { id, userId: user._id };
    if (pending !== undefined) {
      query.pending = (pending === 'true');
    }
    if (filter) {
      if (filter === 'oneWay') {
        query.fromPlace = null;
        query.toPlace = { $ne: null };
      } else if (filter === 'return') {
        query.fromPlace =  { $ne: null };
        query.toPlace = null;
      }
    }
    
    const result = await rideRepository.findWhere(query);

    return res.status(200).send(result);
  });

  app.delete('/api/ride', middleware.isAuthorized, async (req, res, next) => {
    try {
      const user = await req.user;
      const validation = validate(req.body, selectOneSchema);
      if (validation.error) {
        return res.status(400).json({ message: validation.error });
      }
      const { id } = req.body;
  
      await newDeleteRide(rideRepository, driverRideRepository, eventBookingRepository)(id, user._id);
      await eventBookingRepository.incrementRideChanges(ride.eventBookingId);
  
      return res.status(200).send({ message: 'Ride deleted' }); 
    } catch (error) {
      return next(error);
    }
  });

  app.post('/api/ride/accept', middleware.isDriverCaptain, async (req, res, next) => {
    try {
      const validation = validate(req.body, acceptRideSchema);
      if (validation.error) {
        throw ErrorResponse.BadRequest(validation.error);
      }
  
      const { id, driverId } = req.body;
  
      await newAcceptRide(rideRepository, driverRepository, driverRideRepository)(id, driverId);
  
      return res.status(200).json({ message: 'Ride accepted' }); 
    } catch (error) {
      return next(error);
    }
  });

  app.post('/api/ride/arrived', middleware.isAuthorized, async (req, res, next) => {
    try {
      const user = await req.user;

      const validation = validate(req.body, selectOneSchema);
      if (validation.error) {
        throw ErrorResponse.BadRequest(validation.error);
      }

      const { id } = req.body;
      const ride = await rideRepository.findById(id);

      if (!ride || ride.userId !== user._id) {
        throw ErrorResponse.NotFound('Incorrect ride id');
      }
      if (ride.pending) {
        throw ErrorResponse.Unauthorized(`Cannot set ride as completed when it hasn't been accepted`);
      }

      const result = await rideRepository.updateOne(id, user._id, { arrived: true });

      if (!result) {
        throw ErrorResponse.NotFound('Incorrect ride id');
      }

      return res.status(200).json(result);
    } catch (error) {
      return next(error);
    }
  });

  app.put('/api/ride', middleware.isAuthorized, async (req, res, next) => {
    try {
      const user = await req.user;

      const validation = validate(req.body, editRideSchema);
      if (validation.error) {
        throw ErrorResponse.BadRequest(validation.error);
      }
  
      const { rideId } = req.body;
      const ride = await rideRepository.findById(rideId);
  
      if (!ride || ride.userId !== user._id) {
        throw ErrorResponse.NotFound('Incorrect ride id');
      }

      const eventBooking = await eventBookingRepository.findById(ride.eventBookingId);
      const rideChanges = eventBooking.rideChanges || 0;
      if (rideChanges >= MAX_RIDE_CHANGES) {
        throw ErrorResponse.Unauthorized('You have reached your ride changes limit!');
      }
  
      const updatedRide = await rideRepository.updateOne(rideId, user._id, req.body);
      await eventBookingRepository.incrementRideChanges(ride.eventBookingId);
      const driver = await userRepository.findByDriverId(ride.driver);
      await pushProvider.sendRideChangedNotification(driver.devices, String(ride._id));
  
      return res.status(200).json({
        message: `Remaining ride changes: ${MAX_RIDE_CHANGES - rideChanges - 1}`,
        data: updatedRide,
      });
    } catch (error) {
      return next(error);
    }
  });
};

