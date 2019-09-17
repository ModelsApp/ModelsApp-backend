const newOfferRepository = (model) => ({
  findOne: async (id) => {
    return model.findOne({ _id: id });
  },

  findManyByIds: (ids) => {
    return model.find({ _id: { $in: ids }}).toArray();
  }
})

module.exports = newOfferRepository;
