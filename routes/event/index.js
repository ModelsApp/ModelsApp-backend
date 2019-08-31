const _ = require('lodash');
const moment = require('moment');

const middleware = require('../../config/authMiddleware');
const newPostSchema = require('./schema/postEvent');
const newEditSchema = require('./schema/editEvent');
const newAddPlaceSchema = require('./schema/place/addPlace');
const newUpdatePlacesSchema = require('./schema/place/updatePlaces');
const removePlaceSchema = require('./schema/place/removePlace');
const oneEventSchema = require('./schema/bookEvent');
const validatePlacesOffers = require('./api/place/validatePlacesOffers');
const validatePlaceOffers = require('./api/place/validatePlaceOffers');
const ErrorResponse = require('./../../core/errorResponse');

module.exports = (app, eventRepository, placeRepository, requirementRepository, bookUtil, validate) => {
  app.post('/api/event', middleware.isAdmin, async (req, res) => {
    const allRequirements = await requirementRepository.getAll();
    const intervalIds = (await bookUtil.getPlaceIntervals(req.body.placeId)).map(i => i._id);
    const validation = validate(req.body, newPostSchema(allRequirements, intervalIds));
    if (validation.error) {
      return res.status(400).json({ message: validation.error });
    }

    const { placeId, requirements, placesOffers, timeframe } = req.body;

    const place = await placeRepository.findOne(placeId);
    if (!place) {
      return res.status(404).json({ message: 'No such place' });
    }

    try {
      await validatePlacesOffers(placesOffers, placeRepository);
    } catch (err) {
      return res.status(400).json({ message: err.message });
    }

    const event = await eventRepository.insertOne({
      placeId,
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
    const allRequirements = await requirementRepository.getAll();
    const validation = validate(req.body, newEditSchema(allRequirements));
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
    const intervalIds = (await bookUtil.getPlaceIntervals(req.body.placeId)).map(i => i._id);
    const validation = validate(req.body, newAddPlaceSchema(intervalIds));
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
    const intervalIds = (await bookUtil.getPlaceIntervals(req.body.placeId)).map(i => i._id);
    const validation = validate(req.body, newUpdatePlacesSchema(intervalIds));
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

