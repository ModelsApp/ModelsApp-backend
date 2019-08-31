const schema = require('./schema');
const middleware = require('../../config/authMiddleware');

module.exports = (app, requirementRepository, validate) => {
  app.put('/api/requirement', middleware.isAdmin, async (req, res, next) => {
    try {
      const validation = validate(req.body, schema);
      if (validation.error) {
        return res.status(400).json({ message: validation.error });
      }
  
      const { name, image } = req.body;
  
      const result = await requirementRepository.updateOrCreate(name, image);
  
      return res.status(200).send(result);
    } catch (error) {
      return next(error);
    }
  });

  app.get('/api/requirement', middleware.isAuthorized, async (req, res, next) => {
    try {
      const { id, name } = req.query;
      const result = await requirementRepository.findWhere({ id, name });
  
      return res.status(200).json(result);
    } catch (error) {
      return next(error);
    }
  });
};

