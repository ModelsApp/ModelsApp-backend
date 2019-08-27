const Joi = require('@hapi/joi');

const locationSchema = Joi.object().keys({
  longitude: Joi.number().required(),
  latitude: Joi.number().required(),
});

module.exports = {
  driverRideId: Joi.string().strict().required(),
  from: locationSchema.required(),
  to: locationSchema.required(),
  fromPlace: Joi.number().integer().strict(),
  toPlace: Joi.number().integer().strict(),
  eventBookingId: Joi.string().strict().required(),
};
