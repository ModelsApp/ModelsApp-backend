const Joi = require('@hapi/joi');

const schema = Joi.object().keys({
  eventId: Joi.string().strict().required(), 
});

module.exports = schema;
