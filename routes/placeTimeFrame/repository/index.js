const newPlaceExtraRepository = (model) => ({
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
    return new Promise((resolve, reject) => {
      model.find(
        {
        ...(id && { _id: id }),
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
});

module.exports = newPlaceExtraRepository;
