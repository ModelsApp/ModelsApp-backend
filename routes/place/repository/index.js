const newPlaceRepository = (model) => ({
  findOne: (id) => {
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
  }
});

module.exports = newPlaceRepository;
