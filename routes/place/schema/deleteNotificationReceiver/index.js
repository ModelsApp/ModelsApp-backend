const Joi = require('@hapi/joi');

const schema = Joi.object().keys({
  email: Joi.string().strict().required(),
});

module.exports = schema;
