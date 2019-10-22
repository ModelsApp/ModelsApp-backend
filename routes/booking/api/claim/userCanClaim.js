const moment = require('moment');

const ErrorResponse = require('./../../../../core/errorResponse');

const userCanClaim = (user, booking, requiredCredits) => {
  if (booking.claimed = true) {
    throw ErrorResponse.Unauthorized('Booking has already been claimed');
  }
  let creditsToPay = requiredCredits < 0 ? -requiredCredits : requiredCredits;

  if (user.credits < creditsToPay) {
    throw ErrorResponse.Unauthorized('Not enough credits');
  }

  const bookingDate = moment(`${booking.date} ${booking.startTime}`, 'DD-MM-YYYY h.mm')
    .subtract({ hours: 1 });

  if (moment().isAfter(bookingDate)) {
    throw ErrorResponse.Unauthorized('Cannot claim, its too late');
  }

  return true;
};

module.exports = userCanClaim;
