const Joi = require('@hapi/joi');

const timeframe = require('../timeframe');
const newPlaceOffers = require('./../place/placeOffers');
const generateRequirements = require('./requirements');

const newSchema = (requirements, intervalIds) => Joi.object().keys({
  placeId: Joi.number().integer().strict().required(),
  requirements: Joi.object().keys(generateRequirements(requirements)).required(),
  placesOffers: Joi.array().items(newPlaceOffers(intervalIds)).required(),
  timeframe,
  baseCredits: Joi.number().integer().strict().required(),
  level: Joi.number().integer().strict(),
});

module.exports = newSchema;
