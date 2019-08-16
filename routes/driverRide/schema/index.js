const Joi = require('@hapi/joi');

const timeframe = require('./../../event/schema/timeframe');

const schema = Joi.object().keys({
  driverId: Joi.string().strict().required(),
  from: Joi.string().strict().required(),
  to: Joi.string().strict().required(),
  timeframe,
});

module.exports = schema;
