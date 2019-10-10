const bcrypt = require('bcrypt-nodejs');

const newPlaceRepository = (model, requirementRepository) => ({
  findOne: (id) => {
    return model.findOne({ _id: id });
  },

  findById: (id) => {
    return model.findOne({ _id: id });
  },

  findAllWhere: (query) => {
    return model.find(query).toArray();
  },

  findAllWhereIncludeFields: (query, fieldsToInclude) => {
    const projectionFields = fieldsToInclude.reduce((acc, field) => ({ ...acc, [field]: 1 }), {});
    return model.find(query, { projection: { ...projectionFields }}).toArray();
  },

  findAllWhereExcludeFields: (query, fieldsToExclude) => {
    const projectionFields = fieldsToExclude.reduce((acc, field) => ({ ...acc, [field]: 0 }), {});
    return model.find(query, { projection: { ...projectionFields }}).toArray();
  },

  findOneAndUpdate: (id, options) => {
    return model.findOneAndUpdate({ _id: id }, { ...options });
  },

  findManyByIds: (ids) => {
    return model.find({ _id: { $in: ids } }).toArray();
  },

  joinRequirements: async (place) => {
    return {
      ...place,
      requirements: await Promise.all(Object.entries(place.requirements)
        .map(async ([key, value]) => ({
            ...(await requirementRepository.findOneByName(key)),
            value,
        }))),
    };
  },

  findByClientEmail: (email) => {
    return model.findOne({ 'client.email': email });
  },

  setClientTempPass: (placeId, temporaryPassword) => {
    return model.updateOne(
      {
        _id: placeId,
      },
      { $set: { 'client.temporaryPassword': bcrypt.hashSync(temporaryPassword, bcrypt.genSaltSync(8), null) } }, 
      { new: true, returnOriginal: false },
    );
  },

  setClientPass: (placeId, password) => {
    return model.updateOne(
      {
        _id: placeId,
      },
      {
        $set: {
          'client.temporaryPassword': null,
          'client.password': password,
        },
      }, 
      { new: true, returnOriginal: false },
    );
  },

  findPaginatedPlaces(limit, page) {
    const query = model.find({});
    if (limit && page) {
      query.skip(limit*(page+1))
        .limit(limit)
        .sort({ _id: 1 })
    }

    return query.toArray();
  }
});

module.exports = newPlaceRepository;
