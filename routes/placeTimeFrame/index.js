const newPostSchema = require('./schema');
const middleware = require('./../../config/authMiddleware');

module.exports = (app, placeTimeFrameRepository, placeTypeRepository, validate) => {
  app.put('/api/place-time-frame', middleware.isAdmin, async (req, res) => {
    const validTypes = (await placeTypeRepository.find({}, { projection: { type: 1 } }))
      .map(placeType => placeType.type);
    const validation = validate(req.body, newPostSchema(validTypes));
    if (validation.error) {
      return res.status(400).json({ message: validation.error });
    }

    const { type, name } = req.body;
    let result;

    try {
      result = await placeTimeFrameRepository.updateOrCreate({ type, name });
    } catch (error) {
      return res.status(500).json({ message: 'Something went wrong' });
    }

    return res.status(200).send(result.value);
  });

  app.get('/api/place-time-frame', middleware.isAuthorized, async (req, res) => {
    const { id, type, name } = req.query;
    let result;
    try {
      result = await placeTimeFrameRepository.find({ id, type, name });
    } catch (error) {
      return res.status(500).json({ message: 'Something went wrong' });
    }

    return res.status(200).send(result);
  });
};

