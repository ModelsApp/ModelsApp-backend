const _ = require('lodash');

const postSchema = require('./schema/post');
const selectOneSchema = require('./schema/selectOne');
const middleware = require('../../config/authMiddleware');
const ErrorResponse = require('./../../core/errorResponse');

module.exports = (app, driverRideRepository, driverRepository, rideRepository, validate) => {
  app.post('/api/driver-ride', middleware.isAdmin, async (req, res) => {
    const validation = validate(req.body, postSchema);
    if (validation.error) {
      return res.status(400).json({ message: validation.error });
    }

    const { drivers, place, timeframe } = req.body;

    for (const driverId of drivers) {
      if (!await driverRepository.findById(driverId)) {
        return res.status(404).json({ message: `No driver with id ${driverId}` });
      }
    }

    const result = await driverRideRepository.insertOne({ drivers, place, timeframe });

    return res.status(201).send(result);
  });

  app.get('/api/driver-ride/place', middleware.isAuthorized, async (req, res, next) => {
    try {
      const placeId = parseInt(req.query.placeId);
      if (!placeId) {
        throw ErrorResponse.BadRequest('Provide placeId');
      }

      const driverRides = await driverRideRepository.findByPlaceId(placeId);

      return res.status(200).json(driverRides);
    } catch (error) {
      return next(error);
    }
  });

  app.get('/api/driver-ride', middleware.isDriverCaptain, async (req, res, next) => {
    try {
      const { id, groupBy, filter } = req.query;
      const query = {
        ...(id && { id }),
      };
  
      let result;
  
      switch (groupBy) {
        case 'timeframe': {
          result = await driverRideRepository.findWhere(query);
          result = await driverRideRepository.joinRides(result);
          break;          
        }
        case 'driver': {
          result = await driverRepository.find({});
          result = await Promise.all(result.map(async (driver) => { 
            const driverRides = await driverRideRepository.findByDriverId(driver._id);
            const driverRidesJoined = await driverRideRepository.joinRides(driverRides);

            return { ...driver, driverRides: driverRidesJoined };
          }))
          break;
        }
        default: {
          result = await driverRideRepository.findWhere(query);
        }
      }
  
      return res.status(200).json(result);
    } catch (error) {
      return next(error);
    }
  });

  app.get('/api/driver-ride/my-pickups', middleware.isDriver, async (req, res, next) => {
    try {
      const user = await req.user;
      const { filter } = req.query;

      let driverRides = await driverRideRepository.findForDriver(user.driver);
      driverRides = await driverRideRepository.joinRides(driverRides);

      if (filter === 'oneWay') {
        driverRides = driverRides
          .map(driverRide => ({
            ...driverRide,
            rides: driverRide.rides.filter(ride => !ride.fromPlace && ride.toPlace),
          }));
      }
      if (filter === 'return') {
        driverRides = driverRides
          .map(driverRide => ({
            ...driverRide,
            rides: driverRide.rides.filter(ride => ride.fromPlace && !ride.toPlace),
          }));
      }

      for (driverRide of driverRides) {
        driverRide.rides = await Promise.all(driverRide.rides.map((ride) => rideRepository.joinPlaces(ride)));
        driverRide.rides = await Promise.all(driverRide.rides.map((ride) => rideRepository.joinUser(ride)));
      }
  
      return res.status(200).json(driverRides);
    } catch (error) {
      return next(error);
    }
  });

  app.delete('/api/driver-ride', middleware.isAdmin, async (req, res) => {
    const validation = validate(req.body, selectOneSchema);
    if (validation.error) {
      return res.status(400).json({ message: validation.error });
    }

    try {
      await driverRideRepository.deleteOne(req.body.id);
    } catch (err) {
      return res.status(400).json({ message: 'Wrong id!' });
    }

    return res.status(200).send({ message: 'Driver ride deleted' });
  });
};

