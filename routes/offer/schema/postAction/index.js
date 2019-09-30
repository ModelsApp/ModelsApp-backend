const Joi = require('@hapi/joi');

const schema = Joi.object().keys({
  offerId: Joi.number().strict().integer().required(),
  bookingId: Joi.number().strict().integer().required(),
  actionType: Joi.string().strict().required(),
  star: Joi.number().strict().integer().required(),
  feedback: Joi.string().strict().allow(null),
  link: Joi.string().strict().allow(null),
});

module.exports = schema;
