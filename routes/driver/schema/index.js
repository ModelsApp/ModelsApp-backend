const Joi = require('@hapi/joi');

const schema = Joi.object().keys({
  car: Joi.object().keys({
    model: Joi.string().strict().required(),
    licensePlate: Joi.string().strict().regex(/\S{7}/).required(),
  }),
  name: Joi.string().strict().required(),
  picture: Joi.string().strict().required(),
  spots: Joi.number().integer().strict().required(),
  phone: Joi.string().strict().required(),
});

module.exports = schema;
