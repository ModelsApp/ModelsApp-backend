const moment = require('moment');

const newDeleteEventBooking = (
  eventBookingRepository, 
  eventRepository,
  bookingUtil,
  deleteRide,
) => async (id, userId) => {
  let eventBooking = await eventBookingRepository.findWhere({ id, userId });
  if (!eventBooking) {
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
    await eventRepository.unbookEvent(eventBooking.eventId, userId);

    for (const bookingId of eventBooking.bookings) {
      await bookingUtil.unbook(bookingId);
    }
  
    for (const driverRideId of eventBooking.rides) {
      await deleteRide(driverRideId);
    }

    await eventBookingRepository.deleteOne(id);
  });
};

module.exports = newDeleteEventBooking;
