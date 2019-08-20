const Joi = require('@hapi/joi');

const schema = Joi.object().keys({
  id: Joi.string().strict().required(),
  eventId: Joi.string().strict().required(),
});

module.exports = schema;
