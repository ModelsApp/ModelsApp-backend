const Joi = require('@hapi/joi');

const newPlaceOffers = require('../placeOffers');

const newSchema = (intervalIds) => Joi.object().keys({
  id: Joi.string().strict().required(),
  placesOffers: Joi.array().items(newPlaceOffers(intervalIds)).required(),
});

module.exports = newSchema;
