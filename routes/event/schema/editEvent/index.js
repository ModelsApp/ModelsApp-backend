const Joi = require('@hapi/joi');

const timeframe = require('../timeframe');
const placeOffers = require('./../place/placeOffers');

const schema = Joi.object().keys({
  eventId: Joi.string().strict().required(),
  requirements: Joi.object().keys({
    dressCode: Joi.string().strict().valid(['Elegant', 'Casual']),
  }),
  placesOffers: Joi.array().items(placeOffers),
  timeframe,
  placeId: Joi.number().integer().strict(),
}).min(2);

module.exports = schema;
