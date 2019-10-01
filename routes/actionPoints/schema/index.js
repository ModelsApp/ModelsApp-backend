const Joi = require('@hapi/joi');

const schema = Joi.object().keys({
  provider: Joi
    .string()
    .strict()
    .required()
    .valid(['instaStories', 'instaPost', 'fbPost', 'tripAdvisorPost', 'gPost', 'yelpPost']),
  image: Joi.string().strict().required().allow(''),
  points: Joi.number().strict().required(),
});

module.exports = schema;
