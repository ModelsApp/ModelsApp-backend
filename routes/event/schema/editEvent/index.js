const Joi = require('@hapi/joi');

const timeframe = require('../timeframe');
const newPlaceOffers = require('./../place/placeOffers');
const generateRequirements = require('./../postEvent/requirements');

const newSchema = (requirements, intervalIds) => Joi.object().keys({
  eventId: Joi.string().strict().required(),
  requirements: Joi.object().keys(generateRequirements(requirements)),
  placesOffers: Joi.array().items(newPlaceOffers(intervalIds)),
  timeframe,
  placeId: Joi.number().integer().strict(),
  baseCredits: Joi.number().integer().strict(),
  level: Joi.number().integer().strict(),
  eventOffers: Joi.array().items(Joi.string().strict()),
}).min(2);

module.exports = newSchema;
