const Joi = require('@hapi/joi');

const editUser = require('./../editUser/editUser');

const newSchema = () => Joi.object().keys({
  ...editUser,
  userId: Joi.number().integer().strict().required(),
  admin: Joi.boolean().strict(),
  driver: Joi.string().strict(),
  driverCaptain: Joi.boolean().strict(),
});

module.exports = newSchema;
