const Joi = require('@hapi/joi');

const generateRequirements = (requirements) => requirements
  .reduce((acc, requirement) => ({ ...acc, [requirement.name]: Joi.string().strict() }), {});

module.exports = generateRequirements;
