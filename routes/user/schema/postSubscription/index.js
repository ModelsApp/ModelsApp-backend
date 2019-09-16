const Joi = require('@hapi/joi');
const { SUBSCRIPTION } = require('./../../../../config/constant');

const newSchema = () => Joi.object().keys({
  subscription: Joi.string().strict().valid(Object.values(SUBSCRIPTION)).required(),
  months: Joi.number().integer().required(),
});

module.exports = newSchema;
