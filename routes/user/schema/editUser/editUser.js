const Joi = require('@hapi/joi');
const { GENDERS } = require('./../../constant');

const newSchema = {
  registerStep: Joi.number().integer(),
  name: Joi.string().strict(),
  surname: Joi.string().strict(),
  gender: Joi.string().strict().valid(Object.values(GENDERS)),
  nationality: Joi.string().strict(),
  birthDate: Joi.string().strict(),
  phone: Joi.string().strict(),
  motherAgency: Joi.string().strict(),
  currentAgency: Joi.string().strict(),
  city: Joi.string().strict(),
  instagramName: Joi.string().strict(),
  level: Joi.number().integer(),
  deviceID: Joi.string(),
  referral: Joi.string().strict(),
};

module.exports = newSchema;
