
const Repository = require('./../../../core/repository');

class UserRepository extends Repository {
  constructor(model) {
    super(model);
  }

  findOne (id) {
    return this.model.findOne({ _id: id });
  }

  async findOneAndUpdateAction (id, actionType, options = {}) {
    const user = await this.model.findOne({ _id: id });
    if (!user) {
      return null;
    }
    let { action_counters } = user;
    if (!action_counters) {
      action_counters = {};
    }
    const previousValue = action_counters[actionType];
    action_counters[actionType] = previousValue ? previousValue + 1 : 1;
    const newTotalCounter = Object.values(action_counters).reduce((acc, value) => acc + value, 0);
    const updatedUser = await this.model.findOneAndUpdate(
      { _id: id },
      {
        ...options,
        $set: {
          ...options.$set,
          action_total_counter: newTotalCounter,
          action_counters,
        },
      });

    return updatedUser.value;
  }

  addEventBooking (id, eventBookingId) {
    return this._addToArray(id, 'eventBookings', eventBookingId);
  }

  removeEventBooking (id, eventBookingId) {
    return this._removeFromArray(id, 'eventBookings', eventBookingId);
  }
}

module.exports = (model) => new UserRepository(model);
