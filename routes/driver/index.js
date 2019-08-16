const schema = require('./schema');
const middleware = require('./../../config/authMiddleware');

module.exports = (app, driverRepository, validate) => {
  app.put('/api/driver', middleware.isAdmin, async (req, res) => {
    const validation = validate(req.body, schema);
    if (validation.error) {
      return res.status(400).json({ message: validation.error });
    }

    const { car, name, picture } = req.body;

    const result = await driverRepository.updateOrCreate(car, name, picture);

    return res.status(200).send(result.value);
  });

  app.get('/api/driver', middleware.isAuthorized, async (req, res) => {
    const { id, name } = req.query;
    
    const result = await driverRepository.find({ id, name });

    return res.status(200).send(result);
  });
};

