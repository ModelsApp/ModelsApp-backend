const newValidateRide = require('./validateRide');

const newPostRide = (rideRepository, driverRideRepository, eventBookingRepository) => async (
  rideData, userId, pending = true, driver = null,
) => {
  const { driverRideId, from, to, fromPlace, toPlace, eventBookingId, address } = rideData;

  await newValidateRide(rideRepository, driverRideRepository, eventBookingRepository)(
    driverRideId, eventBookingId, userId,
  );

  const result = await rideRepository.insertOne({
    driverRideId, from, to, fromPlace, toPlace, userId, eventBookingId, address, pending, driver,
  });
  await eventBookingRepository.addRide(result.eventBookingId, String(result._id));

  return result;
};

module.exports = newPostRide;
