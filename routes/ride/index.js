const _ = require('lodash');

const postSchema = require('./schema/post');
const selectOneSchema = require('./schema/selectOne');
const acceptRideSchema = require('./schema/acceptRide');
const middleware = require('../../config/authMiddleware');
const newDeleteRide = require('./api/deleteRide');
const ErrorResponse = require('./../../core/errorResponse');

module.exports = (app, rideRepository, driverRideRepository, eventBookingRepository, driverRepository, validate) => {
  app.post('/api/ride', middleware.isAuthorized, async (req, res) => {
    const user = await req.user;

    const validation = validate(req.body, postSchema);
    if (validation.error) {
      return res.status(400).json({ message: validation.error });
    }

    const { driverRideId, from, to, fromPlace, toPlace, eventBookingId } = req.body;

    if (!await driverRideRepository.findById(driverRideId)) {
      return res.status(404).json({ message: 'No driver ride with given id' });
    }
    if (!await eventBookingRepository.findById(eventBookingId)) {
      return res.status(404).json({ message: 'No event booking with given id' });
    }
    if ((await rideRepository.findExisting(user._id, driverRideId)).length) {
      return res.status(400).json({ message: 'User already has a ride for this timeframe' });
    }

    const result = await rideRepository.insertOne({
      driverRideId, from, to, fromPlace, toPlace, userId: user._id, eventBookingId,
    });
    await eventBookingRepository.addRide(result.eventBookingId, String(result._id));

    return res.status(201).send(result);
  });

  app.get('/api/ride', middleware.isAuthorized, async (req, res) => {
    const user = await req.user;

    const { id } = req.query;
    
    const result = await rideRepository.findWhere({ id, userId: user._id });

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
  
      const ride = await rideRepository.findById(id);
      if (!ride) {
        throw ErrorResponse.NotFound('No ride with given id');
      }
      if (!ride.pending) {
        throw ErrorResponse.Unauthorized('Ride has already been accepted');
      }
      const driverRide = await driverRideRepository.findById(ride.driverRideId);
      if (driverRide.rides.length >= driverRide.timeframe.spots) {
        throw ErrorResponse.Unauthorized('No free spots available for this ride');
      }
      if (!await driverRepository.findById(driverId)) {
        throw ErrorResponse.NotFound('No driver with given id');
      }
      if (!driverRide.drivers.includes(driverId)) {
        throw ErrorResponse.BadRequest('Driver is not part of given driver ride');
      }
      await rideRepository.accept(id, driverId);
      await driverRideRepository.addRide(ride.driverRideId, id);
  
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
};

