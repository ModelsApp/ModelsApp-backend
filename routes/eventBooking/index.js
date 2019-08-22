const _ = require('lodash');
const moment = require('moment');

const middleware = require('../../config/authMiddleware');
const postSchema = require('./schema/post');
const oneBookingSchema = require('./schema/oneBooking');

module.exports = (app, eventBookingRepository, eventRepository, userRepository, bookingUtil, validate) => {
  app.post('/api/event-booking', middleware.isAuthorized, async (req, res) => {
    const user = await req.user;
    if (!user) {
      return res.status(404).json({ message: 'Unauthorized' });
    }

    const validation = validate(req.body, postSchema);
    if (validation.error) {
      return res.status(400).json({ message: validation.error });
    }

    const { eventId, bookings } = req.body;

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

    const bookingDetails = [];
    for (const booking of bookings) {
      const placeOffer = event.placesOffers.find(placeOffer => placeOffer.placeId === booking.placeId);
      if (!placeOffer) {
        return res.status(400).json({ message: `Place ${booking.placeId} is not part of event` });
      }
      if (!booking.offerIds.every(offerId => placeOffer.offerIds.includes(offerId))) {
        return res.status(400).json({ message: `Some offers are not a part of event dinner` });
      }
      if (moment(booking.date).isAfter(moment(event.timeframe.end))) {
        return res.status(400).json({ message: `Booking cannot happen after event finished` });
      }
      try {
        const details = await bookingUtil.bookPossible(booking.placeId, user._id, booking.intervalId, moment(booking.date));
        bookingDetails.push({ booking, ...details });
      } catch (err) {
        if (err instanceof Error) {
          return res.status(400).json({ message: err.message });
        }
        throw err;
      }
    }

    const bookingIds = [];
    for (const details of bookingDetails) {
      let booking;
      try {
        booking = await bookingUtil.book(
          details.booking.placeId,
          user._id,
          details.fullDate,
          details.offers,
          details.chosenInterval,
          details.place,
        );
        for (const offerId of details.booking.offerIds) {
          await bookingUtil.addOfferToBooking(booking._id, offerId);
        }
        bookingIds.push(booking._id);
      } catch (err) {
        if (err instanceof Error) {
          return res.status(400).json({ message: err.message });
        }
        throw err;
      }
    }

    await eventRepository.bookEvent(eventId, user._id);
    const eventBooking = await eventBookingRepository
      .insertOne({ eventId, bookings: bookingIds, userId: user._id });
    await userRepository.addEventBooking(user._id, eventBooking._id);

    return res.status(200).json(eventBooking);
  });

  app.delete('/api/event-booking', middleware.isAuthorized, async (req, res) => {
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
    await eventRepository.unbookEvent(eventId, user._id);
    // unbook all bookings
    for (const bookingId of event.bookings) {
      // call booking util delete
    }
    // unbook all driver rides
    for (const driverRideId of event.rides) {
      // move dependency to external module call it here
    }

    return res.status(200).json({ message: 'Event unbooked' });
  });

  app.get('/api/event-booking', middleware.isAuthorized, async (req, res) => {
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
  });
};

