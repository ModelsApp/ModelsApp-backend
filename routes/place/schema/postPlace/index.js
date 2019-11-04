const Joi = require('@hapi/joi');

const { BOOKING_LIMIT_PERIODS } = require('./../../constant');
const generateRequirements = require('./../../../event/schema/postEvent/requirements');

const daySchedule = Joi.string().strict();
const dayTimeFrame = Joi.array().items(Joi.string());

const newSchema = (validTypes, validExtras, validCities, requirements) => Joi.object().keys({
  name: Joi.string().strict().required(),
  type: Joi.array().items(
    Joi.string().strict().valid(validTypes),
  ),
  requireSpecifyOffer: Joi.boolean(),
  address: Joi.string().strict().required(),
  photos: Joi.array().items(Joi.string()).required(),
  coordinates: Joi.array().min(2).items(Joi.number()).required(),
  socials: Joi.object().keys({
    facebook: Joi.string().strict(),
    tripAdvisor: Joi.string().strict(),
    google: Joi.string().strict(),
    yelp: Joi.string().strict(),
    instagram: Joi.string().strict(),
  }),
  level: Joi.number().required(),
  description: Joi.string().required(),
  schedule: Joi.object().required().keys({
    monday: daySchedule,
    tuesday: daySchedule,
    wednesday: daySchedule,
    thursday: daySchedule,
    friday: daySchedule,
    saturday: daySchedule,
    sunday: daySchedule,
  }),
  slots: Joi.number().required(),
  extra: Joi.array().items(
    Joi.string().strict().valid(validExtras),
  ),
  timeframes: Joi.array().items(Joi.string()),
  servingTimeFrames: Joi.object().keys({
    monday: dayTimeFrame,
    tuesday: dayTimeFrame,
    wednesday: dayTimeFrame,
    thursday: dayTimeFrame,
    friday: dayTimeFrame,
    saturday: dayTimeFrame,
    sunday: dayTimeFrame,
  }),
  bookingLimits: Joi.object().pattern(/^\d+$/, Joi.number().integer().strict()),
  bookingLimitsPeriod: Joi.string().strict().valid(Object.values(BOOKING_LIMIT_PERIODS)),
  city: Joi.string().strict().valid(validCities).required(),
  requirements: Joi.object().keys(generateRequirements(requirements)).required(),
});

module.exports = newSchema;
