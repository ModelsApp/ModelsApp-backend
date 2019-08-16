const schema = require('./schema');
const middleware = require('./../../config/authMiddleware');

module.exports = (app, actionPointsRepository, validate) => {
  app.put('/api/action-points', middleware.isAdmin, async (req, res) => {
    const validation = validate(req.body, schema);
    if (validation.error) {
      return res.status(400).json({ message: validation.error });
    }

    const { provider, points } = req.body;
    let result;

    try {
      result = await actionPointsRepository.updateOrCreate(provider, points);
    } catch (error) {
      return res.status(500).json({ message: 'Something went wrong' });
    }

    return res.status(200).send(result.value);
  });

  app.get('/api/action-points', middleware.isAuthorized, async (req, res) => {
    const { id, provider } = req.query;
    let result;
    try {
      result = await actionPointsRepository.find(id, provider);
    } catch (error) {
      return res.status(500).json({ message: 'Something went wrong' });
    }

    return res.status(200).send(result);
  });
};

