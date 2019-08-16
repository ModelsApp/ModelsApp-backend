const moment = require('moment');
const { ObjectId } = require('mongodb');

const getObjectId = (id) => {
  if (!id) {
    return null;
  }
  let oid;
  try {
    oid = new ObjectId(id);
  } catch (e) {
    return null;
  }
  return oid;
}

const newDriverRepository = (model) => ({
  async insertOne({ driverId, from, to, timeframe }) {
    if (timeframe) {
      timeframe.start = moment(timeframe.start).toISOString();
      timeframe.end = moment(timeframe.end).toISOString();
    }

    const result = await model.insertOne({
      driverId,
      from,
      to,
      timeframe,
      createdAt: moment().utc().toISOString(),
    });

    return result.ops[0];
  },

  updateOrCreate(car, name, picture) {
    return new Promise((resolve, reject) => {
      model.findOneAndUpdate(
        {
          name,
        },
        {
          $set: {
            car,
            name,
            picture,
            createdAt: moment().utc().toISOString(),
          }
        },
        {
          returnOriginal: false,
          returnNewDocument: true,
          upsert: true,
          new: true,
        },
        (error, result) => {
          if (error) reject(error);
          resolve(result);
        },
      );
    });
  },

  findWhere: ({ id, driverId }) => {
    const oid = getObjectId(id);
    return new Promise((resolve, reject) => {
      model.find(
        {
        ...(oid && { _id: oid }),
        ...(driverId && { driverId }),
        },
      ).toArray((err, results) => {
          if (err) reject(err);
          resolve(results);
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

module.exports = newDriverRepository;
