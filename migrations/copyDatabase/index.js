const newCopyDatabase = async (entitiesSource, entitiesDest) => {
  for (entity of Object.keys(entitiesSource)) {
    const sourceEntity = entitiesSource[entity];
    const destEntity = entitiesDest[entity];

    const allSource = await sourceEntity.find({}).toArray();
    await destEntity.insertMany(allSource);
  }
};

module.exports(newCopyDatabase);
