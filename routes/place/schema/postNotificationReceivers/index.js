const Joi = require('@hapi/joi');

const schema = Joi.object().keys({
  receivers: Joi.array().items(Joi.object().keys({
    name: Joi.string().strict().required(),
    surname: Joi.string().strict().required(),
    email: Joi.string().strict().required(),
  })),
});

module.exports = schema;
