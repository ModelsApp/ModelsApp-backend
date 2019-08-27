const ErrorResponse = require('./../../../../core/errorResponse');

const newValidateRide = (rideRepository, driverRideRepository, eventBookingRepository) => async (
  driverRideId, eventBookingId, userId,
) => {
  if (!await driverRideRepository.findById(driverRideId)) {
    throw ErrorResponse.NotFound('No driver ride with given id');
  }
  if (!await eventBookingRepository.findById(eventBookingId)) {
    throw ErrorResponse.NotFound('No event booking with given id');
  }
  if ((await rideRepository.findExisting(userId, driverRideId)).length) {
    throw ErrorResponse.BadRequest('User already has a ride for this timeframe');
  }
}

module.exports = newValidateRide;
