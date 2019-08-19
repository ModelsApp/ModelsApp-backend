const _ = require('lodash');

const postSchema = require('./schema/postEvent');
const addPlaceSchema = require('./schema/addPlace');
const updatePlacesSchema = require('./schema/updatePlaces');
const removePlaceSchema = require('./schema/removePlace');
const bookEventSchema = require('./schema/bookEvent');
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

  app.post('/api/event/book', middleware.isAuthorized, async (req, res) => {
    const user = await req.user;
    if (!user) {
      return res.status(404).json({ message: 'Unauthorized' });
    }

    const validation = validate(req.body, bookEventSchema);
    if (validation.error) {
      return res.status(400).json({ message: validation.error });
    }
    
    const { eventId } = req.body;

    const event = await eventRepository.findById(eventId);
    if (!event) {
      return res.status(404).json({ message: 'No event with given id' });
    }
    if (event.participants.length >= event.timeframe.spots) {
      return res.status(403).json({ message: 'No free spots available for this event' });
    }
    if (_.includes(event.participants, user._id)) {
      return res.status(400).json({ message: 'User already participates in this event' });
    }
    await eventRepository.bookEvent(eventId, user._id);

    return res.status(200).json({ message: 'Event booked' });
  });

  app.delete('/api/event/book', middleware.isAuthorized, async (req, res) => {
    const user = await req.user;
    if (!user) {
      return res.status(404).json({ message: 'Unauthorized' });
    }

    const validation = validate(req.body, bookEventSchema);
    if (validation.error) {
      return res.status(400).json({ message: validation.error });
    }
    
    const { eventId } = req.body;

    const event = await eventRepository.findById(eventId);
    if (!event) {
      return res.status(404).json({ message: 'No event with given id' });
    }
    if (!_.includes(event.participants, user._id)) {
      return res.status(400).json({ message: 'User does not participate in this event' });
    }
    await eventRepository.unbookEvent(eventId, user._id);

    return res.status(200).json({ message: 'Event unbooked' });
  });
};

