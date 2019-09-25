const Joi = require('@hapi/joi');

const schema = Joi.object().keys({
  location: Joi.object().keys({
    latitude: Joi.number().strict().required(),
    longitude: Joi.number().strict().required(),
  }),
});

module.exports = schema;
