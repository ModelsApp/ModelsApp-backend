const Joi = require('@hapi/joi');

const schema = Joi.object().keys({
  id: Joi.string().strict().required(),
  driverId: Joi.string().strict().required(),
});

module.exports = schema;