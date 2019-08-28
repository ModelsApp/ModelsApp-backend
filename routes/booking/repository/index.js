const newBookingRepository = (model) => ({
  findOneById: (id) => {
    return model.findOne({ _id: id });
  },

  findAllWhere: (query) => {
    return model.find(query).toArray();
  },

  findOneAndSet: (id, options) => {
    return model.findOneAndUpdate({ _id: id }, { $set: { ...options } });
  },

  findAllRegularBookingsForUser: (userId) => {
    return model.find({ user: userId }, { eventBooking: false }).toArray();
  }
});

module.exports = newBookingRepository;
