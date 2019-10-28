const moment = require('moment');

const userCanClaim = (user, booking, requiredCredits) => {
  if (booking.claimed) {
    return {
      value: false,
      message: 'Booking has already been claimed',
    }
  }
  let creditsToPay = requiredCredits < 0 ? -requiredCredits : requiredCredits;

  if (user.credits < creditsToPay) {
    return {
        value: false,
        message: 'Not enough credits',
    }
  }

  const bookingDate = moment(`${booking.date} ${booking.startTime}`, 'DD-MM-YYYY h.mm')
    .subtract({ hours: 1 });

  if (moment().isAfter(bookingDate)) {
    return {
      value: false,
      message: "Cannot claim, it's too late",
    }
  }

  if (moment().duration(end.diff(bookingDate)).asMinutes() > 60) {
    return {
      value: false,
      message: "Cannot claim, it's too early",
    }
  }

  return {
    value: true,
    message: '',
  }
};

module.exports = userCanClaim;
