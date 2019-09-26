
const Repository = require('./../../../core/repository');
const ErrorResponse = require('./../../../core/errorResponse');

class OfferPostRepository extends Repository {
  constructor(model) {
    super(model);
  }

  findByUserId (userId, limit) {
    const query = this.model.find({ user: userId });
    if (limit) {
      query.limit(limit);
    }

    return query.toArray();
  }
}

module.exports = (model) => new OfferPostRepository(model);
