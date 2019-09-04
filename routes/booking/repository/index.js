const newBookingRepository = (model, placeRepository) => ({
  findManyByIds: (ids) => {
    return model.find({ _id: { $in: ids } }).toArray();
  },

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
  },

  joinPlace: async (booking) => {
    return {
      ...booking,
      place: await placeRepository.findById(booking.place),
    }
  },
});

module.exports = newBookingRepository;
