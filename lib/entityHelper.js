const newEntityHelper = (Counter) => async (type) => {
  const seq = await Counter.findOneAndUpdate(
    { _id: type },
    { $inc: { seq: 1 } },
    { new: true });
  return seq.value.seq;
};

module.exports = newEntityHelper;
