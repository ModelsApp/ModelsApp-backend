const Joi = require('@hapi/joi');

const timeframe = require('../../../event/schema/timeframe');

const schema = Joi.object().keys({
  drivers: Joi.array().items(Joi.string().strict()).required(),
  place: Joi.number().integer().strict().required(),
  timeframe: timeframe.required(),
});

module.exports = schema;
