const _ = require('lodash');

const ErrorResponse = require('../../../../core/errorResponse');

const validateEventBooking = (event, userId) => {
  if (!event) {
    throw ErrorResponse.NotFound('No event with given id');
  }
  if (event.participants.length >= event.timeframe.spots) {
    throw ErrorResponse.Unauthorized('No free spots available for this event');
  }
  if (_.includes(event.participants, userId)) {
    throw ErrorResponse.BadRequest('User already participates in this event');
  }
};

module.exports = validateEventBooking;
