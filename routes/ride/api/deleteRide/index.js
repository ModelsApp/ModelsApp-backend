const ErrorResponse = require('./../../../../core/errorResponse');

const newDeleteRide = (rideRepository, driverRideRepository, eventBookingRepository) => async (id, userId) => {
  let ride = await rideRepository.findWhere({ id, userId });
  if (!ride || !ride.length) {
    throw ErrorResponse.BadRequest('Wrong id!');
  }
  ride = ride[0];

  await driverRideRepository.removeRide(ride.driverRideId, id);
  await rideRepository.deleteOne(id);
  await eventBookingRepository.removeRide(ride.eventBookingId, id);
};

module.exports = newDeleteRide;
