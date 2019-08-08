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
    return new Promise((resolve, reject) => {
      model.find(
        {
        ...(id && { _id: id }),
        ...(provider && { provider }),
        }).toArray((err, actionPoints) => {
          if (err) reject(err);
          resolve(actionPoints);
        });
      });
  },

  updateOrCreate(provider, points) {
    return new Promise((resolve, reject) => {
      model.findOneAndUpdate(
        {
          provider,
        },
        {
          $set: { provider, points }
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
