const Joi = require('@hapi/joi');

const schema = Joi.object().keys({
  eventId: Joi.string().strict().required(),
  bookings: Joi.array().items(Joi.object().keys({
    placeId: Joi.number().integer().strict().required(),
    intervalId: Joi.string().strict().required(),
    date: Joi.date().required(),
  })),
});

module.exports = schema;
