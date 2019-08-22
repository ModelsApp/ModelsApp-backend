const _ = require('lodash');

const postSchema = require('./schema/post');
const selectOneSchema = require('./schema/selectOne');
const acceptRideSchema = require('./schema/acceptRide');
const middleware = require('../../config/authMiddleware');

module.exports = (app, rideRepository, driverRideRepository, eventBookingRepository, driverRepository, validate) => {
  app.post('/api/ride', middleware.isAuthorized, async (req, res) => {
    const user = await req.user;
    if (!user) {
      return res.status(404).json({ message: 'Unauthorized' });
    }

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
    if (!user) {
      return res.status(404).json({ message: 'Unauthorized' });
    }

    const { id } = req.query;
    
    const result = await rideRepository.findWhere({ id, userId: user._id });

    return res.status(200).send(result);
  });

  app.delete('/api/ride', middleware.isAuthorized, async (req, res) => {
    const validation = validate(req.body, selectOneSchema);
    if (validation.error) {
      return res.status(400).json({ message: validation.error });
    }
    const { id } = req.body;

    const ride = await rideRepository.findById(id);
    if (!ride) {
      return res.status(400).json({ message: 'Wrong id!' });
    }

    await driverRideRepository.removeRide(ride.driverRideId, id);
    await rideRepository.deleteOne(id);
    await eventBookingRepository.removeRide(ride.eventBookingId, id);

    return res.status(200).send({ message: 'Ride deleted' });
  });

  app.post('/api/ride/accept', middleware.isAuthorized, async (req, res) => {
    const user = await req.user;
    if (!user) {
      return res.status(404).json({ message: 'Unauthorized' });
    }

    const validation = validate(req.body, acceptRideSchema);
    if (validation.error) {
      return res.status(400).json({ message: validation.error });
    }

    const { id, driverId } = req.body;

    const ride = await rideRepository.findById(id);
    if (!ride) {
      return res.status(404).json({ message: 'No ride with given id' });
    }
    if (!ride.pending) {
      return res.status(400).json({ message: 'Ride has already been accepted' });
    }
    const driverRide = await driverRideRepository.findById(ride.driverRideId);
    if (driverRide.rides.length >= driverRide.timeframe.spots) {
      return res.status(403).json({ message: 'No free spots available for this ride' });
    }
    if (!await driverRepository.findById(driverId)) {
      return res.status(404).json({ message: 'No driver with given id' });
    }
    await rideRepository.accept(id, driverId);
    await driverRideRepository.addRide(ride.driverRideId, id);

    return res.status(200).json({ message: 'Ride accepted' });
  });
};

