const moment = require('moment');
const calculateCredits = require('./../../../actionPoints/calculator/action');
const ErrorResponse = require('./../../../../core/errorResponse');

const newDeleteEventBooking = (
  eventBookingRepository, 
  eventRepository,
  userRepository,
  bookingUtil,
  deleteRide,
) => async (id, user, disableUser = false) => {
  let eventBooking;
  if (!disableUser) {
    eventBooking = await eventBookingRepository.findWhere({ id, userId: user._id });
  } else {
    eventBooking = await eventBookingRepository.findWhere({ id });
  }
  if (!eventBooking.length) {
    throw ErrorResponse.NotFound();
  }
  eventBooking = eventBooking[0];
  const event = await eventRepository.findById(eventBooking.eventId);
  const duration = moment.duration(moment().diff(event.timeframe.start));
  const hours = duration.asHours();

  if (hours > -2) {
    if (hours >= 0) {
      throw ErrorResponse.Unauthorized(`Couldn't unbook event as it has already started`);
    }
    throw ErrorResponse.Unauthorized(`Couldn't unbook event as it starts in less than 2 hours`);
  }
  await eventBookingRepository.transaction(async () => {
    if (user) {
      await eventRepository.unbookEvent(eventBooking.eventId, user._id);
    }

    for (const bookingId of eventBooking.bookings) {
      await bookingUtil.unbook(bookingId);
    }
  
    for (const driverRideId of eventBooking.rides) {
      await deleteRide(driverRideId);
    }

    await eventBookingRepository.deleteOne(id);
    await userRepository.addCredits(user, calculateCredits(event.baseCredits, user.level, event.level));
  });
};

module.exports = newDeleteEventBooking;
