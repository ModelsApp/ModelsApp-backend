const Joi = require('@hapi/joi');

const placeOffers = require('../placeOffers');

const schema = Joi.object().keys({
  id: Joi.string().strict().required(),
  placesOffers: Joi.array().items(placeOffers).required(),
});

module.exports = schema;
