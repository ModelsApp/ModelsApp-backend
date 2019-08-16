const newPostSchema = require('./schema');
const middleware = require('./../../config/authMiddleware');

module.exports = (app, placeExtraRepository, placeTypeRepository, validate) => {
  app.put('/api/place-extra', middleware.isAdmin, async (req, res) => {
    const validTypes = (await placeTypeRepository.find({}, { projection: { type: 1 } }))
      .map(placeType => placeType.type);
    const validation = validate(req.body, newPostSchema(validTypes));
    if (validation.error) {
      return res.status(400).json({ message: validation.error });
    }

    const { type, name, image } = req.body;
    let result;

    try {
      result = await placeExtraRepository.updateOrCreate(type, name, image);
    } catch (error) {
      return res.status(500).json({ message: 'Something went wrong' });
    }

    return res.status(200).send(result.value);
  });

  app.get('/api/place-extra', middleware.isAuthorized, async (req, res) => {
    const { id, name, type } = req.query;
    let result;
    try {
      result = await placeExtraRepository.find({ id, name, type });
    } catch (error) {
      return res.status(500).json({ message: 'Something went wrong' });
    }

    return res.status(200).send(result);
  });
};

