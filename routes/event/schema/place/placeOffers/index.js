const Joi = require('@hapi/joi');

module.exports = Joi.object().keys({
  placeId: Joi.number().integer().strict().required(),
  offerIds: Joi.array().items(Joi.number().integer().strict()).required(),
});
