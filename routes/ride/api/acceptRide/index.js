const ErrorResponse = require('./../../../../core/errorResponse');
const newValidateDriverRide = require('./validateDriverRide');
const newHandleRelations = require('./handleRelations');

const newAcceptRide = (rideRepository, driverRepository, driverRideRepository) => async (id, driverId) => {
  const ride = await rideRepository.findById(id);
  if (!ride) {
    throw ErrorResponse.NotFound('No ride with given id');
  }
  if (!ride.pending) {
    throw ErrorResponse.Unauthorized('Ride has already been accepted');
  }
  const driverRide = await driverRideRepository.findById(ride.driverRideId);
  await newValidateDriverRide(driverRepository)(driverRide, driverId)
  await newHandleRelations(rideRepository, driverRideRepository)(id, driverId, ride);
}

module.exports = newAcceptRide;
