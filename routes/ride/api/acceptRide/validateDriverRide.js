const ErrorResponse = require('./../../../../core/errorResponse');

const newValidateRide = (driverRepository) => async (driverRide, driverId) => {
  if (driverRide.rides.length >= driverRide.timeframe.spots) {
    throw ErrorResponse.Unauthorized('No free spots available for this ride');
  }
  if (!await driverRepository.findById(driverId)) {
    throw ErrorResponse.NotFound('No driver with given id');
  }
  if (!driverRide.drivers.includes(driverId)) {
    throw ErrorResponse.BadRequest('Driver is not part of given driver ride');
  }
}

module.exports = newValidateRide;
