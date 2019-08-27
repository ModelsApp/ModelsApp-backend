const newHandleRelations = (rideRepository, driverRideRepository) => async (id, driverId, ride) => {
  await rideRepository.accept(id, driverId);
  await driverRideRepository.addRide(ride.driverRideId, id);
}

module.exports = newHandleRelations;
