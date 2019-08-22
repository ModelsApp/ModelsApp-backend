const _ = require('lodash');
const moment = require('moment');

const middleware = require('../../config/authMiddleware');
const postSchema = require('./schema/postEvent');
const editSchema = require('./schema/editEvent');
const addPlaceSchema = require('./schema/place/addPlace');
const updatePlacesSchema = require('./schema/place/updatePlaces');
const removePlaceSchema = require('./schema/place/removePlace');
const oneEventSchema = require('./schema/bookEvent');
const validatePlacesOffers = require('./api/place/validatePlacesOffers');
const validatePlaceOffers = require('./api/place/validatePlaceOffers');

module.exports = (app, eventRepository, placeRepository, validate) => {
  app.post('/api/event', middleware.isAdmin, async (req, res) => {
    const validation = validate(req.body, postSchema);
    if (validation.error) {
      return res.status(400).json({ message: validation.error });
    }

    const { requirements, placesOffers, timeframe } = req.body;

    try {
      await validatePlacesOffers(placesOffers, placeRepository);
    } catch (err) {
      return res.status(400).json({ message: err.message });
    }

    const event = await eventRepository.insertOne({
      requirements,
      placesOffers,
      timeframe,
    });

    return res.status(201).json(event);
  });

  app.delete('/api/event', middleware.isAdmin, async (req, res) => {
    const validation = validate(req.body, oneEventSchema);
    if (validation.error) {
      return res.status(400).json({ message: validation.error });
    }

    try {
      await eventRepository.deleteOne(req.body.eventId);
    } catch (err) {
      return res.status(400).json({ message: 'Wrong id!' });
    }

    return res.status(200).send({ message: 'Event deleted' });
  });

  app.put('/api/event', async (req, res) => {
    const validation = validate(req.body, editSchema);
    if (validation.error) {
      return res.status(400).json({ message: validation.error });
    }

    if (req.body.placesOffers) {
      try {
        await validatePlacesOffers(req.body.placesOffers, placeRepository);
      } catch (err) {
        return res.status(404).json({ message: err.message });
      }
    }

    const updatedEvent = await eventRepository.updateOne(req.body.eventId, req.body);
    if (!updatedEvent) {
      return res.status(404).json({ message: 'Wrong id' });
    }

    return res.status(200).json(updatedEvent);
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

    const { id, placeOffers } = req.body;

    if (!await eventRepository.findById(id)) {
      return res.status(404).json({ message: 'No event with given id' });
    }
    try {
      await validatePlaceOffers(placeOffers, placeRepository);
    } catch (err) {
      return res.status(404).json({ message: err.message });
    }

    const event = await eventRepository.addPlaceOffers(id, placeOffers);

    return res.status(200).json(event);
  });

  app.put('/api/event/place', middleware.isAdmin, async (req, res) => {
    const validation = validate(req.body, updatePlacesSchema);
    if (validation.error) {
      return res.status(400).json({ message: validation.error });
    }

    const { id, placesOffers } = req.body;

    if (!await eventRepository.findById(id)) {
      return res.status(404).json({ message: 'No event with given id' });
    }
    try {
      await validatePlacesOffers(placesOffers, placeRepository);
    } catch (err) {
      return res.status(404).json({ message: err.message });
    }

    const event = await eventRepository.setPlacesOffers(id, placesOffers);

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
    const event = await eventRepository.removePlaceOffers(id, placeId);

    return res.status(200).json(event);
  });
};

