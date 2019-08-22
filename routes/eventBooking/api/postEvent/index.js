const doBookings = require('./doBookings');
const validateEventBooking = require('./validateEventBooking');

const newPostEventBooking = (
  eventBookingRepository, 
  eventRepository,
  userRepository,
  bookingUtil,
) => async (eventId, bookings, user) => {

  const event = await eventRepository.findById(eventId);
  
  validateEventBooking(event, user._id);
  const bookingIds = await doBookings(event, user._id, bookings, bookingUtil);

  await eventRepository.bookEvent(eventId, user._id);
  const eventBooking = await eventBookingRepository
    .insertOne({ eventId, bookings: bookingIds, userId: user._id });
  await userRepository.addEventBooking(user._id, eventBooking._id);

  return { status: 200, message: eventBooking };
};

module.exports = newPostEventBooking;
