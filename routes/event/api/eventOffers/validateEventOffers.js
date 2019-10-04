const ErrorResponse = require('./../../../../core/errorResponse');

const validateEventOffers = async (eventOffers, eventOfferRepository) => {
  for (const eventOffer of eventOffers) {
    if (!await eventOfferRepository.findOneByName(eventOffer)) {
      throw ErrorResponse.BadRequest(`event offer ${eventOffer} does not exist`);
    }
  }

  return true;
};

module.exports = validateEventOffers;
