const { ObjectId } = require('mongodb');

class Repository {
  constructor(model, client) {
    this.model = model;
    this.client = client;
  }

  getObjectId(id) {
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

  async _addToArray(id, field, value) {
    const oid = this.getObjectId(id);
    if (!oid) {
      throw new Error('Provide correct id!');
    }
    const entity = await this.model.findOneAndUpdate({ _id: oid }, { $push: { [field]: value } }, { returnOriginal: false });
    return entity.value;
  }

  async _removeFromArray(id, field, value) {
    const oid = this.getObjectId(id);
    if (!oid) {
      throw new Error('Provide correct id!');
    }
    let v;
    if (typeof value === 'number') {
      v = value;
    } else {
      try {
        v = String(value);
      } catch (e) {
        v = value;
      }
    }
    const entity = await this.model.findOneAndUpdate({ _id: oid }, { $pull: { [field]: v } }, { returnOriginal: false });
    return entity.value;
  }

  async _setField(id, field, value) {
    const oid = this.getObjectId(id);
    if (!oid) {
      throw new Error('Provide correct id!');
    }
    let v = this.getObjectId(value);
    if (!v) {
      v = value;
    }
    const entity = await this.model.findOneAndUpdate({ _id: oid }, { $set: { [field]: value } }, { returnOriginal: false });
    return entity.value;
  }

  async transaction(fun) {
    const session = this.client.startSession({ defaultTransactionOptions: {
      readConcern: { level: 'local' },
      writeConcern: { w: 'majority' },
      readPreference: 'primary',
    }});
    session.startTransaction();

    try {
      const result = await fun();
      await session.commitTransaction();
      session.endSession();
      return result;
    } catch (err) {
      await session.abortTransaction();
      session.endSession();
      throw err;
    }
  }
}

module.exports = Repository;
