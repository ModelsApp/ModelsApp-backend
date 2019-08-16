const schema = require('./schema');
const middleware = require('../../config/authMiddleware');

module.exports = (app, driverRideRepository, driverRepository, validate) => {
  app.post('/api/driver-ride', middleware.isAuthorized, async (req, res) => {
    const validation = validate(req.body, schema);
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
};

