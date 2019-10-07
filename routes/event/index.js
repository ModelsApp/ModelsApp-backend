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
const validateEventOffers = require('./api/eventOffers/validateEventOffers')
const ErrorResponse = require('./../../core/errorResponse');

module.exports = (
  app,
  eventRepository,
  placeRepository,
  requirementRepository,
  eventOfferRepository,
  deleteEvent,
  bookUtil,
  validate,
) => {
  app.post('/api/event', middleware.isAdmin, async (req, res, next) => {
    try {
      const allRequirements = await requirementRepository.getAll();
      const intervalIds = (await bookUtil.getPlaceIntervals(req.body.placeId)).map(i => i._id);
      const validation = validate(req.body, newPostSchema(allRequirements, intervalIds));
      if (validation.error) throw ErrorResponse.BadRequest(validation.error);
  
      const {
        placeId,
        requirements,
        placesOffers,
        timeframe,
        baseCredits,
        level,
        eventOffers,
      } = req.body;
  
      const place = await placeRepository.findOne(placeId);
      if (!place) throw ErrorResponse.NotFound('no such place');
  
      let levelToSet = level;
      if (!levelToSet) {
        levelToSet = place.level;
      }

      await validatePlacesOffers(placesOffers, placeRepository);
      await validateEventOffers(eventOffers, eventOfferRepository);
      
      const event = await eventRepository.insertOne({
        placeId,
        requirements,
        placesOffers,
        timeframe,
        baseCredits,
        level: levelToSet || 1,
        eventOffers: await eventOfferRepository.findManyByName(eventOffers),
      });

      return res.status(201).json(event);
    } catch (error) {
      return next(error);
    }
  });

  app.delete('/api/event', middleware.isAdmin, async (req, res, next) => {
    try {
      const validation = validate(req.body, oneEventSchema);
      if (validation.error) {
        throw ErrorResponse.BadRequest(validation.error);
      }
  
      await deleteEvent(req.body.eventId);
  
      return res.status(200).send({ message: 'Event deleted' });
    } catch (error) {
      return next(error);
    }
  });

  app.put('/api/event', async (req, res, next) => {
    try {
      const allRequirements = await requirementRepository.getAll();
      const placeId = req.body.placeId || (await eventRepository.findById(req.body.eventId)).placeId;
      const intervalIds = (await bookUtil.getPlaceIntervals(placeId)).map(i => i._id);
      const validation = validate(req.body, newEditSchema(allRequirements, intervalIds));
      if (validation.error) {
        return res.status(400).json({ message: validation.error });
      }
  
      if (req.body.placesOffers) {
        await validatePlacesOffers(req.body.placesOffers, placeRepository);
      }
      if (req.body.eventOffers) {
        await validateEventOffers(req.body.eventOffers, eventOfferRepository);
      }
    
      const updatedEvent = await eventRepository.updateOne(req.body.eventId, {
        ...req.body,
        ...(req.body.eventOffers && { eventOffers: await eventOfferRepository.findManyByName(req.body.eventOffers) }),
      });
      if (!updatedEvent) throw ErrorResponse.BadRequest('wrong id');
    
      return res.status(200).json(updatedEvent);
    } catch (error) {
      return next(error);
    }
  });

  app.get('/api/event', middleware.isAuthorized, async (req, res) => {
    const { id } = req.query;
    let events = await eventRepository.findWhere({ id });
    events = await Promise.all(events.map((event) => eventRepository.joinRequirements(event)));

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

  app.get('/api/event/placeOffers', middleware.isAuthorized, async (req, res, next) => {
    try {
      const { eventId } = req.query;
      const placeId = parseInt(req.query.placeId);

      let placesOffers;
      if (!eventId) {
        return res.status(200).json([]);
      }
      
      const event = await eventRepository.findById(eventId);
      placesOffers = event.placesOffers;

      if (req.query.placeId) {
        placesOffers = placesOffers.find(placeOffer => placeOffer.placeId === placeId)
        if (!placesOffers) return res.status(200).json([]);
        placesOffers = [placesOffers];
      }

      return res.status(200).json(placesOffers);
    } catch (error) {
      return next(error);
    }
  });
};

