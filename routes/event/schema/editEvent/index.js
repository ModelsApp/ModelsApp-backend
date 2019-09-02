const Joi = require('@hapi/joi');

const timeframe = require('../timeframe');
const placeOffers = require('./../place/placeOffers');
const generateRequirements = require('./../postEvent/requirements');

const newSchema = (requirements) => Joi.object().keys({
  eventId: Joi.string().strict().required(),
  requirements: Joi.object().keys(generateRequirements(requirements)),
  placesOffers: Joi.array().items(placeOffers),
  timeframe,
  placeId: Joi.number().integer().strict(),
  baseCredits: Joi.number().integer().strict(),
  level: Joi.number().integer().strict(),
}).min(2);

module.exports = newSchema;
