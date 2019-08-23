const _ = require('lodash');
const moment = require('moment');

const ErrorResponse = require('./../../core/errorResponse');
const middleware = require('../../config/authMiddleware');
const postSchema = require('./schema/post');
const putSchema = require('./schema/put');
const oneBookingSchema = require('./schema/oneBooking');

const newPostEventBooking = require('./api/postEvent');
const newPutEventBooking = require('./api/putEvent');

module.exports = (app, eventBookingRepository, eventRepository, userRepository, bookingUtil, validate) => {
  app.post('/api/event-booking', middleware.isAuthorized, async (req, res, next) => {
    try {
      const user = await req.user;
      if (!user) {
        throw ErrorResponse.Unauthorized();
      }

      const validation = validate(req.body, postSchema);
      if (validation.error) {
        throw ErrorResponse.BadRequest(validation.error);
      }

      const { eventId, bookings } = req.body;

      const { status, message } = await newPostEventBooking(
        eventBookingRepository,
        eventRepository,
        userRepository,
        bookingUtil,
      )(eventId, bookings, user);

      return res.status(status).json(message)
    } catch (error) {
      next(error);
    }
  });

  app.put('/api/event-booking', middleware.isAuthorized, async (req, res, next) => {
    try {
      const user = await req.user;
      if (!user) {
        throw ErrorResponse.Unauthorized();
      }

      const validation = validate(req.body, putSchema);
      if (validation.error) {
        throw ErrorResponse.BadRequest(validation.error);
      }

      const { id, eventId, bookings } = req.body;

      const { status, message } = await newPutEventBooking(
        eventBookingRepository,
        eventRepository,
        bookingUtil,
      )(id, eventId, bookings, user._id);

      return res.status(status).json(message)
    } catch (error) {
      next(error);
    }
  });

  app.delete('/api/event-booking', middleware.isAuthorized, async (req, res) => {
    try {
      const user = await req.user;
      if (!user) {
        return res.status(404).json({ message: 'Unauthorized' });
      }
  
      const validation = validate(req.body, oneBookingSchema);
      if (validation.error) {
        return res.status(400).json({ message: validation.error });
      }
      
      const { id } = req.body;
  
      const eventBooking = await eventBookingRepository.findById(id);
      if (!eventBooking) {
        return res.status(404).json({ message: 'No eventBooking with given id' });
      }
      const event = await eventRepository.findById(eventBooking.eventId);
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
      await eventRepository.unbookEvent(eventBooking.eventId, user._id);
      // unbook all bookings
      for (const bookingId of event.bookings) {
        // call booking util delete
      }
      // unbook all driver rides
      for (const driverRideId of event.rides) {
        // move dependency to external module call it here
      }
  
      return res.status(200).json({ message: 'Event unbooked' });
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/event-booking', middleware.isAuthorized, async (req, res) => {
    try {
      const user = await req.user;
      if (!user) {
        return res.status(404).json({ message: 'Unauthorized' });
      }
  
      const { id } = req.query;
  
      const bookings = await eventBookingRepository.findWhere({ id, userId: user._id });
      if (!bookings) {
        return res.status(404).json({ message: 'Not found' });
      }
  
      return res.status(200).json(bookings);
    } catch (error) {
      next(error);
    }
  });
};

