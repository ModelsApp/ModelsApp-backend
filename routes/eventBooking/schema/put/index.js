const Joi = require('@hapi/joi');

const schema = Joi.object().keys({
  id: Joi.string().strict().required(),
  eventId: Joi.string().strict(),
  bookings: Joi.array().items(Joi.object().keys({
    placeId: Joi.number().integer().strict().required(),
    intervalId: Joi.string().strict().required(),
    date: Joi.date().required(),
    offerIds: Joi.array().items(Joi.number().integer().strict()).required(),
  })),
}).min(2);

module.exports = schema;
