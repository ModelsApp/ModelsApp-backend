const moment = require('moment');

const newDriverRepository = (model) => ({
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

  find: ({ id, name, car }, options) => {
    return new Promise((resolve, reject) => {
      model.find(
        {
        ...(id && { _id: id }),
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
    return model.findOne({ _id: id });
  },
});

module.exports = newDriverRepository;
