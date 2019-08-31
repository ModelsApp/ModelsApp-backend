const schema = require('./schema');
const middleware = require('./../../config/authMiddleware');

module.exports = (app, placeTypeRepository, validate) => {
  app.put('/api/place-type', middleware.isAdmin, async (req, res) => {
    const validation = validate(req.body, schema);
    if (validation.error) {
      return res.status(400).json({ message: validation.error });
    }

    const { type, image } = req.body;
    let result;

    try {
      result = await placeTypeRepository.updateOrCreate(type, image);
    } catch (error) {
      return res.status(500).json({ message: 'Something went wrong' });
    }

    return res.status(200).send(result.value);
  });

  app.get('/api/place-type', middleware.isAuthorized, async (req, res) => {
    const { id, type } = req.query;
    let result;
    try {
      result = await placeTypeRepository.find({ id, type });
    } catch (error) {
      return res.status(500).json({ message: 'Something went wrong' });
    }

    return res.status(200).send(result);
  });
};

