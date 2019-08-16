const moment = require('moment');
const { ObjectId } = require('mongodb');

const getObjectId = (id) => {
  let oid;
  try {
    oid = new ObjectId(id);
  } catch (e) {
    return null;
  }
  return oid;
}

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
    const oid = getObjectId(id);
    return new Promise((resolve, reject) => {
      model.findOneAndUpdate(
        {
          _id: oid,
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
    const oid = getObjectId(id);
    return new Promise((resolve, reject) => {
      model.find(
        {
        ...(oid && { _id: oid }),
        },
      ).toArray((err, events) => {
          if (err) reject(err);
          resolve(events);
        });
      });
  },

  findById: (id) => {
    const oid = getObjectId(id);
    if (!oid) {
      return null;
    }
    return model.findOne({ _id: oid });
  },
});

module.exports = newEventRepository;
