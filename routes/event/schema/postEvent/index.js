const Joi = require('@hapi/joi');

const timeframe = require('../timeframe');

const schema = Joi.object().keys({
  requirements: Joi.object().keys({
    dressCode: Joi.string().strict().valid(['Elegant', 'Casual']),
  }).required(),
  placeId: Joi.number().strict().required(),
  timeframe
});

module.exports = schema;
