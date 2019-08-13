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
    return new Promise((resolve, reject) => {
      model.find(
        {
        ...(id && { _id: id }),
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
