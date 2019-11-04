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

const newPlaceServingTimeframesRepository = (model) => ({
  updateOrCreate({ type, name }) {
    return new Promise((resolve, reject) => {
      model.findOneAndUpdate(
        {
          type,
          name,
        },
        {
          $set: { type, name }
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

  find: ({ id, type, name }, options) => {
    const oid = getObjectId(id);
    return new Promise((resolve, reject) => {
      model.find(
        {
        ...(oid && { _id: oid }),
        ...(type && { type }),
        ...(name && { name }),
        },
        options,
      ).toArray((err, timeFrames) => {
          if (err) reject(err);
          resolve(timeFrames);
        });
      });
  },

  findOne: ({ id, type, name }, options) => {
    const oid = getObjectId(id);
    return model.findOne({
      ...(oid && { _id: oid }),
      ...(type && { type }),
      ...(name && { name }),
      },
      options,
    );
  },
});

module.exports = newPlaceServingTimeframesRepository;
