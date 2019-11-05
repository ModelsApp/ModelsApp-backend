const newOfferRepository = (model) => ({
  findOne: async (id) => {
    return model.findOne({ _id: id, isActive: true });
  },

  findById: (id) => {
    return model.findOne({ _id: id, isActive: true });
  },

  findManyByIds: (ids) => {
    return model.find({ _id: { $in: ids }, isActive: true }).toArray();
  }
})

module.exports = newOfferRepository;
