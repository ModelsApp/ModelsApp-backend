const ErrorResponse = require('./../../../../core/errorResponse');

const doBookings = require('./../postEvent/doBookings');

const newPutEventBooking = (
  eventBookingRepository, 
  eventRepository,
  userRepository,
  bookingRepository,
  bookingUtil,
) => async (id, eventId, bookings, userId) => {
  const foundEventBooking = await eventBookingRepository.findById(id);
  if (!foundEventBooking) {
    throw ErrorResponse.NotFound('Wrong event booking id');
  }

  const event = await eventRepository.findById(eventId);
  if (!event) {
    throw ErrorResponse.NotFound('Wrong eventId');
  }

  const bookingDetails = [];
  for (const booking of bookings) {
    // find out what bookings to delete, and what bookings to add
  }

  const bookingIds = await doBookings(event, userId, bookings, bookingUtil);

  await eventRepository.bookEvent(eventId, userId);
  const eventBooking = await eventBookingRepository
    .insertOne({ eventId, bookings: bookingIds, userId });
  await userRepository.addEventBooking(userId, eventBooking._id);

  return { status: 200, message: eventBooking };
};

module.exports = newPutEventBooking;
