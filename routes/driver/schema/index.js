const Joi = require('@hapi/joi');

const schema = Joi.object().keys({
  car: Joi.string().strict().required(),
  name: Joi.string().strict().required(),
  picture: Joi.string().strict().required(),
});

module.exports = schema;
