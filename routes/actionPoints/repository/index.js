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

const newActionPointsRepository = (model) => ({
    /***
   * 
   * @param {str} provider one of 'instaStories', 'instaPost', 'fbPost', 'tripAdvisorPost', 'gPost', 'yelpPost'
   * 
   * @returns {object | null} object from database
   * 
   */
  findOne: (provider) => {
    return model.findOne({ provider });
  },
  
  find: (id, provider) => {
    const oid = getObjectId(id);
    return new Promise((resolve, reject) => {
      model.find(
        {
        ...(oid && { _id: oid }),
        ...(provider && { provider }),
        }).toArray((err, actionPoints) => {
          if (err) reject(err);
          resolve(actionPoints);
        });
      });
  },

  updateOrCreate(provider, points, image) {
    return new Promise((resolve, reject) => {
      model.findOneAndUpdate(
        {
          provider,
        },
        {
          $set: { provider, points, image }
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
});

module.exports = newActionPointsRepository;
