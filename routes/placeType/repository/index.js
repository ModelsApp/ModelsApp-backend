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

const newPlaceTypeRepository = (model) => ({
  updateOrCreate(type, image) {
    return new Promise((resolve, reject) => {
      model.findOneAndUpdate(
        {
          type,
        },
        {
          $set: { type, image }
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

  find: ({ id, type }, options) => {
    const oid = getObjectId(id);
    return new Promise((resolve, reject) => {
      model.find(
        {
        ...(oid && { _id: oid }),
        ...(type && { type }),
        },
        options,
      ).toArray((err, actionPoints) => {
          if (err) reject(err);
          resolve(actionPoints);
        });
      });
  },

  findOne: (type) => {
    return model.findOne({ type });
  }
});

module.exports = newPlaceTypeRepository;
