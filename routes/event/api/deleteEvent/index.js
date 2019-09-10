const newDeleteEvent = (eventRepository, eventBookingRepository, deleteEventBooking) => async (eventId) => {
  await eventRepository.transaction(async () => {
    const eventBookings = await eventBookingRepository.findByEventId(eventId);
    for (const eventBooking of eventBookings) {
      await deleteEventBooking(eventBooking._id, null, true);
    }
    await eventRepository.deleteOne(eventId);
  });

  return 'ok';
}

module.exports = newDeleteEvent;
