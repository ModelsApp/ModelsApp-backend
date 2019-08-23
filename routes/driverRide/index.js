const _ = require('lodash');

const postSchema = require('./schema/post');
const selectOneSchema = require('./schema/selectOne');
const middleware = require('../../config/authMiddleware');

module.exports = (app, driverRideRepository, driverRepository, eventBookingRepository, validate) => {
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

  app.get('/api/driver-ride', middleware.isAdmin, async (req, res) => {
    const { id } = req.query;
    
    const result = await driverRideRepository.findWhere({ id });

    return res.status(200).send(result);
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

