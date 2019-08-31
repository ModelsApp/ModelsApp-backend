const Joi = require('@hapi/joi');

const timeframe = require('../timeframe');
const placeOffers = require('./../place/placeOffers');
const generateRequirements = require('./requirements');

const newSchema = (requirements) => Joi.object().keys({
  placeId: Joi.number().integer().strict().required(),
  requirements: Joi.object().keys(generateRequirements(requirements)).required(),
  placesOffers: Joi.array().items(placeOffers).required(),
  timeframe,
});

module.exports = newSchema;
