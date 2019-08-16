const moment = require('moment');

const newEventRepository = (model) => ({
  async insertOne({ requirements, placeId, timeframe }) {
    if (timeframe) {
      timeframe.start = moment(timeframe.start).toISOString();
      timeframe.end = moment(timeframe.end).toISOString();
    }

    const result = await model.insertOne({
      requirements,
      placeId,
      timeframe,
      createdAt: moment().utc().toISOString(),
    });

    return result.ops[0];
  },

  updateOne(id, { requirements, timeframe }) {
    return new Promise((resolve, reject) => {
      model.findOneAndUpdate(
        {
          _id: id,
        },
        {
          $set: {
            ...(requirements && { requirements }),
            ...(timeframe && { timeframe }),
          }
        },
        {
          returnOriginal: false,
          returnNewDocument: true,
        },
        (error, result) => {
          if (error) reject(error);
          resolve(result);
        },
      );
    });
  },

  findWhere: ({ id }) => {
    return new Promise((resolve, reject) => {
      model.find(
        {
        ...(id && { _id: id }),
        },
      ).toArray((err, events) => {
          if (err) reject(err);
          resolve(events);
        });
      });
  },

  findById: (id) => {
    return model.findOne({ _id: id });
  }
});

module.exports = newEventRepository;
