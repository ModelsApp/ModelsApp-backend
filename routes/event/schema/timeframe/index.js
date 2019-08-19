const Joi = require('@hapi/joi');

module.exports = Joi.object().keys({
  start: Joi.date().required(),
  end: Joi.date().required(),
  spots: Joi.number().integer().required(),
});
