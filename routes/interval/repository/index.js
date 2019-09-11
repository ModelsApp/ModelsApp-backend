const newIntervalRepository = (model) => ({
  findOneById: (id) => {
    return model.findOne({ _id: id });
  },

  findById: (id) => {
    return model.findOne({ _id: id });
  },

  findOneWhere: (query) => {
    return model.findOne(query);
  },

  findAllWhere: (query) => {
    return model.find(query).toArray();
  },

  findOneAndSet: (id, options) => {
    return model.findOneAndUpdate({ _id: id }, { $set: { ...options } });
  }
});

module.exports = newIntervalRepository;
