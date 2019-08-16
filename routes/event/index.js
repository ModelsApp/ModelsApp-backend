const postSchema = require('./schema/postEvent');
const middleware = require('../../config/authMiddleware');

module.exports = (app, eventRepository, placeRepository, validate) => {
  app.post('/api/event', middleware.isAdmin, async (req, res) => {
    const validation = validate(req.body, postSchema);
    if (validation.error) {
      return res.status(400).json({ message: validation.error });
    }

    const { requirements, placeId, timeframe } = req.body;

    if (!await placeRepository.findOne(placeId)) {
      return res.status(404).json({ message: 'No place with given id' });
    }

    const event = await eventRepository.insertOne({
      requirements,
      placeId,
      timeframe,
    });

    return res.status(201).json(event);
  });

  app.get('/api/event', middleware.isAuthorized, async (req, res) => {
    const { id } = req.query;
    const events = await eventRepository.findWhere({ id });

    return res.status(200).json(events);
  });
};

