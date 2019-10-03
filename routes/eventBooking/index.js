const _ = require('lodash');
const moment = require('moment');

const ErrorResponse = require('./../../core/errorResponse');
const middleware = require('../../config/authMiddleware');
const postSchema = require('./schema/post');
const putSchema = require('./schema/put');
const oneBookingSchema = require('./schema/oneBooking');

const newPostEventBooking = require('./api/postEvent');
const newPutEventBooking = require('./api/putEvent');
const newDeleteEventBooking = require('./api/deleteEvent');

module.exports = (
  app,
  eventBookingRepository,
  placeRepository,
  eventRepository,
  bookingRepository,
  rideRepository,
  userRepository,
  bookingUtil,
  deleteRide,
  validate,
) => {
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
      return next(error);
    }
  });

  app.get('/api/event-booking/summary', middleware.isAuthorized, async (req, res, next) => {
    try {
      const user = await req.user;
      let { id } = req.query;
      if (!id) {
        throw ErrorResponse.BadRequest('Define event booking id');
      }
      if (Array.isArray(id)) {
        id = id[0];
      }
  
      let eventBooking = await eventBookingRepository.findWhere({ id, userId: user._id });
      if (!eventBooking) {
        throw ErrorResponse.NotFound('Wrong event booking id');
      }
      eventBooking = eventBooking[0];

      eventBooking = {
        ...eventBooking,
        rides: await rideRepository.findWhere({ id: eventBooking.rides }),
        bookings: await bookingRepository.findManyByIds(eventBooking.bookings),
      };

      eventBooking = {
        ...eventBooking,
        rides: await Promise.all(eventBooking.rides.map(async (ride) => {
          const fromPlace = await placeRepository.findOne(ride.fromPlace);
          const toPlace = await placeRepository.findOne(ride.toPlace);
          return {
            ...ride,
            fromPlace: fromPlace ? fromPlace.name : null,
            toPlace: toPlace ? toPlace.name : null,
          }
        })),
      };

      const oneWayRide = eventBooking.rides.find((ride) => !ride.fromPlace && ride.toPlace);
      const transferRides = eventBooking.rides.filter((ride) => ride.fromPlace && ride.toPlace);
      const returnRide = eventBooking.rides.find((ride) => ride.fromPlace && !ride.toPlace);

      eventBooking = {
        ...eventBooking,
        ...(oneWayRide && { oneWayRide }),
        ...(returnRide && { returnRide }),
        ...(transferRides.length && { transferRides }),
      };
      eventBooking = await eventBookingRepository.joinEvent(eventBooking);
      eventBooking = {
        ...eventBooking,
        event: await eventRepository.joinPlace(eventBooking.event),
        bookings: await Promise.all(
          eventBooking.bookings.map(
            async (booking) => await bookingRepository.joinPlace(booking))),
      };
  
      return res.status(200).json(_.omit(eventBooking, 'rides'));
    } catch (error) {
      return next(error);
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
      return next(error);
    }
  });

  app.delete('/api/event-booking', middleware.isAuthorized, async (req, res, next) => {
    try {
      const user = await req.user;
      if (!user) {
        throw ErrorResponse.Unauthorized();
      }
  
      const validation = validate(req.body, oneBookingSchema);
      if (validation.error) {
        throw ErrorResponse.BadRequest(validation.error);
      }
      
      const { id } = req.body;

      await newDeleteEventBooking(
        eventBookingRepository,
        eventRepository,
        userRepository,
        bookingUtil,
        deleteRide,
      )(id, user);
  
      return res.status(200).json({ message: 'Event unbooked' });
    } catch (error) {
      return next(error);
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
      return next(error);
    }
  });
};

