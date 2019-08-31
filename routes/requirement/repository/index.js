const Repository = require('./../../../core/repository');

class RequirementRepository extends Repository {
  constructor(model, client) {
    super(model, client);
  }

  async updateOrCreate(name, image) {
    const updated = await this.model.findOneAndUpdate(
      {
        name,
      },
      {
        $set: { name: name.toLowerCase(), image }
      },
      {
        returnOriginal: false,
        returnNewDocument: true,
        upsert: true,
        new: true,
      },
    );
    return updated.value;
  }

  findWhere({ id, name }) {
    const oid = this.getObjectId(id);
    return this.model.find(
      {
      ...(oid && { _id: oid }),
      ...(name && { name }),
      },
    ).toArray();
  }

  getAll() {
    return this.model.find({}).toArray();
  }

  findOneByName(name) {
    return this.model.findOne({ name });
  }
}

const newRequirementRepository = (model, client) => new RequirementRepository(model, client);

module.exports = newRequirementRepository;
