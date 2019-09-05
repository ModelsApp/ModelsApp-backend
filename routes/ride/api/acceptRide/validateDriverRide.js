const ErrorResponse = require('./../../../../core/errorResponse');

const newValidateRide = (driverRepository, rideRepository) => async (driverRide, driverId) => {
  const driver = await driverRepository.findById(driverId);
  if (!driver) {
    throw ErrorResponse.NotFound('No driver with given id');
  }
  const rides = await rideRepository.findMany(driverRide.rides);
  const relevantRides = rides.filter(ride => ride.driver === driverId);
  if (relevantRides.length >= driver.spots) {
    throw ErrorResponse.Unauthorized('Given driver has no more free spots for this ride');
  }
  if (!driverRide.drivers.includes(driverId)) {
    throw ErrorResponse.BadRequest('Driver is not part of given driver ride');
  }
}

module.exports = newValidateRide;
