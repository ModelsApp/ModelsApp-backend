const ErrorResponse = require('./../../../../core/errorResponse');

const doBookings = require('./../postEvent/doBookings');

const newPutEventBooking = (
  eventBookingRepository, 
  eventRepository,
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

  let updatedEventBooking;

  await eventBookingRepository.transaction(
    async () => {
      let bookingIds;
      if (Array.isArray(bookings)) {
        for (const bookingId of foundEventBooking.bookings) {
          await bookingUtil.unbook(bookingId);
        }
        bookingIds = await doBookings(event, userId, bookings, bookingUtil);
      } else {
        bookingIds = foundEventBooking.bookings;
      }
    
      updatedEventBooking = await eventBookingRepository
        .updateOne(id, { bookings: bookingIds });
    });

  return { status: 200, message: updatedEventBooking };
};

module.exports = newPutEventBooking;
