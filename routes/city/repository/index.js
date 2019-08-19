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

const newCityRepository = (model) => ({
  updateOrCreate({ name, image }) {
    return new Promise((resolve, reject) => {
      model.findOneAndUpdate(
        {
          name,
        },
        {
          $set: {
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

  find: ({ id, name }, options) => {
    let oid;
    if (id) {
      oid = getObjectId(id);
    }
    return new Promise((resolve, reject) => {
      model.find(
        {
        ...(oid && { _id: oid }),
        ...(name && { name }),
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

module.exports = newCityRepository;
