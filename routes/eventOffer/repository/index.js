const Repository = require('./../../../core/repository');

class EventOfferRepository extends Repository {
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

  findManyByName(names) {
    return this.model.find({ name: { $in: names }}).toArray();
  }
}

const newEventOfferRepository = (model, client) => new EventOfferRepository(model, client);

module.exports = newEventOfferRepository;
