const { ObjectId } = require('mongodb');

const getObjectId = (id) => {
  if (!id) {
    return null;
  }
  if (typeof id === 'number') {
    return id;
  }
  let oid;
  try {
    oid = new ObjectId(id);
  } catch (e) {
    return null;
  }
  return oid;
}

class Repository {
  constructor(model) {
    this.model = model;
  }

  async _addToArray(id, field, value) {
    const oid = getObjectId(id);
    if (!oid) {
      throw new Error('Provide correct id!');
    }
    const entity = await this.model.findOneAndUpdate({ _id: oid }, { $push: { [field]: value } }, { returnOriginal: false });
    return entity.value;
  }

  async _removeFromArray(id, field, value) {
    const oid = getObjectId(id);
    if (!oid) {
      throw new Error('Provide correct id!');
    }
    let v = getObjectId(value);
    if (!v) {
      v = value;
    }
    const entity = await this.model.findOneAndUpdate({ _id: oid }, { $pull: { [field]: v } }, { returnOriginal: false });
    return entity.value;
  }

  async _setField(id, field, value) {
    const oid = getObjectId(id);
    if (!oid) {
      throw new Error('Provide correct id!');
    }
    let v = getObjectId(value);
    if (!v) {
      v = value;
    }
    const entity = await this.model.findOneAndUpdate({ _id: oid }, { $set: { [field]: value } }, { returnOriginal: false });
    return entity.value;
  }
}

module.exports = Repository;
