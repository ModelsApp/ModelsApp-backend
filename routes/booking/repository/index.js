const _ = require('lodash');

const newBookingRepository = (model, placeRepository) => ({
  findManyByIds: (ids) => {
    return model.find({ _id: { $in: ids } }).toArray();
  },

  findById: (id) => {
    return model.findOne({ _id: id });
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
    return model.find({ user: userId, eventId: null }).toArray();
  },

  findAllUserBookings: (userId) => {
    return model.find({ user: userId }).toArray();
  },

  findAllUserNotClosedBookings: (userId) => {
    return model.find({ user: userId, closed: false }).toArray();
  },

  joinPlace: async (booking, fieldsToSelect) => {
    return {
      ...booking,
      place: _.pick((await placeRepository.findById(booking.place)), fieldsToSelect),
    }
  },

  close: (id) => {
    return model.findOneAndUpdate({ _id: id }, { $set: { closed: true } });
  },

  findWhere: (query) => {
    return model.find(query).toArray();
  }
});

module.exports = newBookingRepository;
