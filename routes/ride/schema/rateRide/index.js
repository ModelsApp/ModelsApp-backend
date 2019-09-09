const Joi = require('@hapi/joi');

const schema = Joi.object().keys({
  id: Joi.string().strict().required(),
  stars: Joi.number().integer().strict().required().valid([1, 2, 3, 4, 5]),
});

module.exports = schema;
