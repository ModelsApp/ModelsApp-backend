const Joi = require('@hapi/joi');

const newPlaceOffers = require('./../placeOffers');

const newSchema = (intervalIds) => Joi.object().keys({
  id: Joi.string().strict().required(),
  placeOffers: newPlaceOffers(intervalIds).required(),
});

module.exports = newSchema;
