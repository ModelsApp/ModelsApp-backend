const _ = require('lodash');

const postSchema = require('./schema/post');
const selectOneSchema = require('./schema/selectOne');
const middleware = require('../../config/authMiddleware');

module.exports = (app, driverRideRepository, driverRepository, validate) => {
  app.post('/api/driver-ride', middleware.isAuthorized, async (req, res) => {
    const validation = validate(req.body, postSchema);
    if (validation.error) {
      return res.status(400).json({ message: validation.error });
    }

    const { driverId, from, to, timeframe } = req.body;

    if (!await driverRepository.findById(driverId)) {
      return res.status(404).json({ message: 'No driver with given id' });
    }

    const result = await driverRideRepository.insertOne({ driverId, from, to, timeframe });

    return res.status(201).send(result);
  });

  app.get('/api/driver-ride', middleware.isAuthorized, async (req, res) => {
    const { id, driverId } = req.query;
    
    const result = await driverRideRepository.findWhere({ id, driverId });

    return res.status(200).send(result);
  });

  app.delete('/api/driver-ride', middleware.isAuthorized, async (req, res) => {
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

  app.post('/api/driver-ride/book', middleware.isAuthorized, async (req, res) => {
    const user = await req.user;
    if (!user) {
      return res.status(404).json({ message: 'Unauthorized' });
    }

    const validation = validate(req.body, selectOneSchema);
    if (validation.error) {
      return res.status(400).json({ message: validation.error });
    }

    const { id } = req.body;

    const driverRide = await driverRideRepository.findById(id);
    if (!driverRide) {
      return res.status(404).json({ message: 'No driverRide with given id' });
    }
    if (driverRide.passengers.length >= driverRide.timeframe.spots) {
      return res.status(403).json({ message: 'No free spots available for this ride' });
    }
    if (_.includes(driverRide.passengers, user._id)) {
      return res.status(400).json({ message: 'User already participates in this ride' });
    }
    await driverRideRepository.addPassenger(id, user._id);

    return res.status(200).json({ message: 'Ride booked' });
  });

  app.delete('/api/driver-ride/book', middleware.isAuthorized, async (req, res) => {
    const user = await req.user;
    if (!user) {
      return res.status(404).json({ message: 'Unauthorized' });
    }

    const validation = validate(req.body, selectOneSchema);
    if (validation.error) {
      return res.status(400).json({ message: validation.error });
    }

    const { id } = req.body;

    const driverRide = await driverRideRepository.findById(id);
    if (!driverRide) {
      return res.status(404).json({ message: 'No driverRide with given id' });
    }
    if (!_.includes(driverRide.passengers, user._id)) {
      return res.status(400).json({ message: 'User does not participate in that ride' });
    }
    await driverRideRepository.removePassenger(id, user._id);

    return res.status(200).json({ message: 'Ride unbooked' });
  });
};

