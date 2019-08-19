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

const newPlaceExtraRepository = (model) => ({
  updateOrCreate({ type, name, image }) {
    return new Promise((resolve, reject) => {
      model.findOneAndUpdate(
        {
          type,
          name,
        },
        {
          $set: {
            type,
            name,
            ...(image && { image }),
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

  find: ({ id, name, type }, options) => {
    const oid = getObjectId(id);
    return new Promise((resolve, reject) => {
      model.find(
        {
        ...(oid && { _id: oid }),
        ...(name && { name }),
        ...(type && { type })
        },
        options
      ).toArray((err, actionPoints) => {
          if (err) reject(err);
          resolve(actionPoints);
        });
      });
  },

  findOne: (name) => {
    return model.findOne({ name });
  }
});

module.exports = newPlaceExtraRepository;
