
const Repository = require('./../../../core/repository');
const ErrorResponse = require('./../../../core/errorResponse');

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

  subtractCredits (user, credits) {
    if (!(user.credits >= credits)) {
      throw ErrorResponse.Unauthorized('Not enough credits');
    }
    let toPay = credits;
    if (toPay > 0) {
      toPay = -toPay;
    }
    return this.model.updateOne({ _id: user._id }, { $inc: { credits: toPay }});
  }

  addCredits (user, credits) {
    let toPay = credits;
    if (toPay < 0) {
      toPay = -toPay;
    }
    return this.model.updateOne({ _id: user._id }, { $inc: { credits: toPay }});
  }
}

module.exports = (model) => new UserRepository(model);
