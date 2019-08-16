const Joi = require('@hapi/joi');

const schema = Joi.object().keys({
  id: Joi.string().strict().required(),
  placeIds: Joi.array().required().items(Joi.number().strict()),
});

module.exports = schema;
