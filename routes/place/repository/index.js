const newPlaceRepository = (model) => ({
  findOne: (id) => {
    return model.findOne({ _id: id });
  },

  find: (query, options) => {
    return model.find(query, options).toArray();
  },

  findOneAndUpdate: (id, options) => {
    return model.findOneAndUpdate({ _id: id }, { ...options });
  }
});

module.exports = newPlaceRepository;
