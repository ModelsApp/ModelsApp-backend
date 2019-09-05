const Joi = require('@hapi/joi');

const schema = Joi.object().keys({
  drivers: Joi.array().items(Joi.string().strict()).required(),
  place: Joi.number().integer().strict().required(),
  timeframe: Joi.object().keys({
    start: Joi.date().required(),
    end: Joi.date().required(),
  }),
});

module.exports = schema;
