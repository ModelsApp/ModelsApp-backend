const Joi = require('@hapi/joi');

const schema = Joi.object().keys({
  id: Joi.string().strict().required(),
  placeId: Joi.number().integer().strict(),
});

module.exports = schema;
