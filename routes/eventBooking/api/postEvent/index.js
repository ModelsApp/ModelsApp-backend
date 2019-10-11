const doBookings = require('./doBookings');
const validateEventBooking = require('./validateEventBooking');
const calculateCredits = require('./../../../actionPoints/calculator/action');
const ErrorResponse = require('./../../../../core/errorResponse');

const newPostEventBooking = (
  eventBookingRepository, 
  eventRepository,
  userRepository,
  bookingUtil,
) => async (eventId, bookings, user) => {
  const event = await eventRepository.findById(eventId);
  
  validateEventBooking(event, user._id);
  let eventBooking;
  await eventBookingRepository.transaction(
    async () => {
      await userRepository.subtractCredits(user, calculateCredits(event.baseCredits, user.level, event.level));
      let bookingIds = [];
      if (bookings) {
        bookingIds = await doBookings(event, user._id, bookings, bookingUtil);
        await eventRepository.bookEvent(eventId, user._id);
      }
      eventBooking = await eventBookingRepository
        .insertOne({ eventId, bookings: bookingIds, userId: user._id });
    });
  return { status: 200, message: eventBooking };
};

module.exports = newPostEventBooking;
