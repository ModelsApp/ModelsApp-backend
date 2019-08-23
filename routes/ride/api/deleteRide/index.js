const ErrorResponse = require('./../../../../core/errorResponse');

const newDeleteRide = (rideRepository, driverRideRepository, eventBookingRepository) => async (id) => {
  const ride = await rideRepository.findById(id);
  if (!ride) {
    throw ErrorResponse.BadRequest('Wrong id!');
  }

  await driverRideRepository.removeRide(ride.driverRideId, id);
  await rideRepository.deleteOne(id);
  await eventBookingRepository.removeRide(ride.eventBookingId, id);
};

module.exports = newDeleteRide;
