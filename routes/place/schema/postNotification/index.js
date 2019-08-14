const Joi = require('@hapi/joi');

const newSchema = () => Joi.object().keys({
  placeId: Joi.number().integer().required(),
  date: Joi.date().required(),
  userId: Joi.number().strict().required(),
});

module.exports = newSchema;
