const _ = require('lodash');
const moment = require('moment');

const middleware = require('../../config/authMiddleware');
const postSchema = require('./schema/postEvent');
const editSchema = require('./schema/editEvent');
const addPlaceSchema = require('./schema/place/addPlace');
const updatePlacesSchema = require('./schema/place/updatePlaces');
const removePlaceSchema = require('./schema/place/removePlace');
const bookEventSchema = require('./schema/bookEvent');
const validatePlacesOffers = require('./api/place/validatePlacesOffers');

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

  app.put('/api/event', middleware.isAdmin, async (req, res) => {
    const validation = validate(req.body, editSchema);
    if (validation.error) {
      return res.status(400).json({ message: validation.error });
    }

    if (req.body.placesOffers) {
      try {
        await validatePlacesOffers(placesOffers, placeRepository);
      } catch (err) {
        return res.status(400).json({ message: err.message });
      }
    }

    const updatedEvent = await eventRepository.updateOne(req.body.eventId, req.body);

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
    if (!await placeRepository.findOne(placeOffers.placeId)) {
      return res.status(404).json({ message: 'No place with given id' });
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
      return res.status(400).json({ message: err.message });
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
    const duration = moment.duration(moment().diff(event.timeframe.start));
    const hours = duration.asHours();

    if (hours > -2) {
      if (hours >= 0) {
        return res.status(403).json({ message: `Couldn't unbook event as it has already started` });  
      }
      return res.status(403).json({ message: `Couldn't unbook event as it starts in less than 2 hours` });
    }
    await eventRepository.unbookEvent(eventId, user._id);

    return res.status(200).json({ message: 'Event unbooked' });
  });
};

