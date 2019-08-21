const validatePlaceOffer = require('./validatePlaceOffers');

const validatePlacesOffers = async (placesOffers, placeRepository) => {
  for (const placeOffer of placesOffers) {
    await validatePlaceOffer(placeOffer, placeRepository);
  }

  return true;
}

module.exports = validatePlacesOffers;
