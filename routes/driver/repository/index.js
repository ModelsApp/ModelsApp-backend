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
  updateOrCreate(car, name, picture, spots) {
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
            spots,
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

  find: ({ id, name, car }, options) => {
    const oid = getObjectId(id);
    return new Promise((resolve, reject) => {
      model.find(
        {
        ...(oid && { _id: oid }),
        ...(car && { car }),
        ...(name && { name }),
        },
        options,
      ).toArray((err, drivers) => {
          if (err) reject(err);
          resolve(drivers);
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
