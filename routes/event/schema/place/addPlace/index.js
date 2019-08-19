const Joi = require('@hapi/joi');

const placeOffers = require('./../placeOffers');

const schema = Joi.object().keys({
  id: Joi.string().strict().required(),
  placeOffers: placeOffers.required(),
});

module.exports = schema;
