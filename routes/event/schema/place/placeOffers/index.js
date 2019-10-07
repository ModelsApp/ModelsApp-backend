const Joi = require('@hapi/joi');

module.exports = (intervalIds) => Joi.object().keys({
  placeId: Joi.number().integer().strict().required(),
  intervalId: Joi.string().strict().valid(intervalIds).required(),
  offerIds: Joi.array().items(Joi.number().integer().strict()).required(),
});
