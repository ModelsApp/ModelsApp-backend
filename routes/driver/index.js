const schema = require('./schema');
const postDriverLocationSchema = require('./schema/postDriverLocation');
const middleware = require('./../../config/authMiddleware');
const ErrorResponse = require('./../../core/errorResponse');

module.exports = (app, driverRepository, rideRepository, userRepository, pushProvider, calculateDistance, validate) => {
  app.put('/api/driver', middleware.isAdmin, async (req, res) => {
    const validation = validate(req.body, schema);
    if (validation.error) {
      return res.status(400).json({ message: validation.error });
    }

    const { car, name, picture, spots, phone } = req.body;

    const result = await driverRepository.updateOrCreate(car, name, picture, spots, phone);

    return res.status(200).send(result.value);
  });

  app.get('/api/driver', middleware.isAuthorized, async (req, res) => {
    const { id, name } = req.query;
    
    const result = await driverRepository.find({ id, name });

    return res.status(200).send(result);
  });

  app.get('/api/driver/my-rides', middleware.isDriver, async (req, res, next) => {
    try {
      const user = await req.user;

      const driver = await driverRepository.findById(user.driver);
      if (!driver) {
        throw ErrorResponse.NotFound('Could not verify user driver account');
      }
      
      const driverRides = await rideRepository.findCurrentDriverRides(driver._id);

      return res.status(200).json(driverRides);
    } catch (error) {
      return next(error);
    }
  });

  app.post('/api/driver/driver-location', middleware.isDriver, async (req, res, next) => {
    try {
      const user = await req.user;

      const validation = validate(req.body, postDriverLocationSchema);
      if (validation.error) {
        throw ErrorResponse.BadRequest(validation.error);
      }

      const rides = await rideRepository.getAllByDriver(user.driver);
      const { location: { latitude, longitude } } = req.body;

      await Promise.all(rides.map(async (ride) => {
        if (
          calculateDistance(ride.from.latitude, ride.from.longitude, latitude, longitude) < 1
          && !ride.arrivingNotificationSent
        ) {
          const passenger = await userRepository.findById(ride.userId);
          await pushProvider.driverIsArriving(passenger.devices, user, req.body.location);
          await rideRepository.setArrivingNotification(ride._id);
          await driverRepository.updateLocation(latitude, longitude);
        }
      }));

      return res.status(200).json({ message: 'ok' });
    } catch (error) {
      return next(error);
    }
  });
};

