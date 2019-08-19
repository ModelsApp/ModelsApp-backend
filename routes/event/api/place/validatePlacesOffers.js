const validatePlacesOffers = async (placesOffers, placeRepository) => {
  const placeIds = placesOffers.map(placeOffer => placeOffer.placeId);
  const foundPlaces = await placeRepository.findManyByIds(placeIds);
  if (foundPlaces.length !== placeIds.length) {
    throw new Error('Invalid place ids');
  }

  return true;
}

module.exports = validatePlacesOffers;
