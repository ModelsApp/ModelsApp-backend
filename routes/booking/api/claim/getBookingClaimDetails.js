const ErrorResponse = require('../../../../core/errorResponse');

const getBookingClaimDetails = (Offer, User, bookingUtil) => async (booking) => {
  let offers = await Offer.find({ _id: { $in: booking.offers } }, { projection: { level: 1 } }).toArray();
  const user = await User.findOne({ _id: booking.user });
  if (!user) {
    throw ErrorResponse.NotFound('User not found');
  }
  offers = bookingUtil.generateOfferPrices(offers, user.level);
  let requiredCredits = 0;
  offers.forEach((offer) => { requiredCredits += offer.price });
  requiredCredits -= booking.payed;

  if (requiredCredits > 0) {
    requiredCredits = -requiredCredits;
  }

  return { user, requiredCredits };
};

module.exports = getBookingClaimDetails;
