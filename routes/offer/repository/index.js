const newOfferRepository = (model) => ({
  findOne: async (id) => {
    return model.findOne({ _id: id });
  },

  findById: (id) => {
    return model.findOne({ _id: id, isActive: true });
  },

  findManyByIds: (ids) => {
    return model.find({ _id: { $in: ids }}).toArray();
  }
})

module.exports = newOfferRepository;
