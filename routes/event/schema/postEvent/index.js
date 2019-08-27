const Joi = require('@hapi/joi');

const timeframe = require('../timeframe');
const placeOffers = require('./../place/placeOffers');

const schema = Joi.object().keys({
  placeId: Joi.number().integer().strict().required(),
  requirements: Joi.object().keys({
    dressCode: Joi.string().strict().valid(['Elegant', 'Casual']),
  }).required(),
  placesOffers: Joi.array().items(placeOffers).required(),
  timeframe,
});

module.exports = schema;
