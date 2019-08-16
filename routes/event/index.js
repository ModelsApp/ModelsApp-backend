const postSchema = require('./schema/postEvent');
const addPlaceSchema = require('./schema/addPlace');
const updatePlacesSchema = require('./schema/updatePlaces');
const removePlaceSchema = require('./schema/removePlace');
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

  app.post('/api/event/place', middleware.isAdmin, async (req, res) => {
    const validation = validate(req.body, addPlaceSchema);
    if (validation.error) {
      return res.status(400).json({ message: validation.error });
    }

    const { id, placeId } = req.body;

    if (!await eventRepository.findById(id)) {
      return res.status(404).json({ message: 'No event with given id' });
    }
    if (!await placeRepository.findOne(placeId)) {
      return res.status(404).json({ message: 'No place with given id' });
    }

    const event = await eventRepository.addPlace(id, placeId);

    return res.status(200).json(event);
  });

  app.put('/api/event/place', middleware.isAdmin, async (req, res) => {
    const validation = validate(req.body, updatePlacesSchema);
    if (validation.error) {
      return res.status(400).json({ message: validation.error });
    }

    const { id, placeIds } = req.body;

    if (!await eventRepository.findById(id)) {
      return res.status(404).json({ message: 'No event with given id' });
    }
    const foundPlaces = await placeRepository.findManyByIds(placeIds);
    if (foundPlaces.length !== placeIds.length) {
      return res.status(404).json({ message: 'Invalid place ids' });
    }

    const event = await eventRepository.setPlaces(id, placeIds);

    return res.status(200).json(event);
  });

  app.delete('/api/event/place', middleware.isAdmin, async (req, res) => {
    const validation = validate(req.body, removePlaceSchema);
    if (validation.error) {
      return res.status(400).json({ message: validation.error });
    }
    
    const { id, placeId } = req.body;

    if (!await eventRepository.findById(id)) {
      return res.status(404).json({ message: 'No event with given id' });
    }
    const event = await eventRepository.removePlace(id, placeId);

    return res.status(200).json(event);
  });
};

