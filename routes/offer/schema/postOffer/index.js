const Joi = require('@hapi/joi');

const { OFFER_SCOPES } = require('./../../constant');

const schema = Joi.object().keys({
  name: Joi.string().strict().required(),
  userID: Joi.number().required(),
  composition: Joi.array().items(Joi.string()).required(),
  price: Joi.number().required(),
  timeframes: Joi.array().items(Joi.string()).required(),
  photo: Joi.string().strict().required(),
  level: Joi.number(),
  credits: Joi.object().required(),
  scopes: Joi.array().items(Joi.string().valid(Object.values(OFFER_SCOPES))),
});

module.exports = schema;
