const Joi = require('@hapi/joi');
const editUser = require('./editUser');

const newSchema = () => Joi.object().keys({
  ...editUser,
});

module.exports = newSchema;
