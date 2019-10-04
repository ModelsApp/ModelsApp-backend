const schema = require('./schema');
const middleware = require('../../config/authMiddleware');
const ErrorResponse = require('../../core/errorResponse');

module.exports = (app, eventOfferRepository, validate) => {
  app.put('/api/event-offer', middleware.isAdmin, async (req, res, next) => {
    try {
      const validation = validate(req.body, schema);
      if (validation.error) throw ErrorResponse.BadRequest(validation.error);
  
      const { name, image } = req.body;
  
      const result = await eventOfferRepository.updateOrCreate(name, image);
  
      return res.status(200).send(result);
    } catch (error) {
      return next(error);
    }
  });

  app.get('/api/event-offer', middleware.isAuthorized, async (req, res, next) => {
    try {
      const { id, name } = req.query;
      const result = await eventOfferRepository.findWhere({ id, name });
  
      return res.status(200).json(result);
    } catch (error) {
      return next(error);
    }
  });
};

