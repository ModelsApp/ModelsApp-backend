const Joi = require('@hapi/joi');

const { ACCESS } = require('./../../constant');
const { GENDERS } = require('./../../../user/constant');
const { BOOKING_LIMIT_PERIODS } = require('./../../constant');

const daySchedule = Joi.string().strict();
const dayTimeFrame = Joi.array().items(Joi.string());

const newSchema = (validTypes, validExtras, validCities) => Joi.object().keys({
  isActive: Joi.boolean().strict(),
  phone: Joi.string().strict(),
  instapage: Joi.string().strict(),
  name: Joi.string().strict(),
  type: Joi.string().strict().valid(validTypes),
  address: Joi.string().strict(),
  photo: Joi.string().strict(),
  photos: Joi.array().items(Joi.string()),
  location: Joi.object().keys({ coordinates: Joi.array().min(2).items(Joi.number()) }),
  socials: Joi.object().keys({
    facebook: Joi.string().strict(),
    tripAdvisor: Joi.string().strict(),
    google: Joi.string().strict(),
    yelp: Joi.string().strict(),
    instagram: Joi.string().strict(),
  }),
  level: Joi.number().integer(),
  description: Joi.string(),
  schedule: Joi.object().keys({
    monday: daySchedule,
    tuesday: daySchedule,
    wednesday: daySchedule,
    thursday: daySchedule,
    friday: daySchedule,
    saturday: daySchedule,
    sunday: daySchedule,
  }),
  slots: Joi.number().integer(),
  extra: Joi.array().items(
    Joi.string().strict().valid(validExtras),
  ),
  access: Joi.string().strict().valid(Object.values(ACCESS)),
  allows: Joi.array().items(Joi.string().valid(Object.values(GENDERS))),
  timeFrames: Joi.object().keys({
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
  city: Joi.string().strict().valid(validCities),
});

module.exports = newSchema;
