const moment = require('moment');
const { ObjectId } = require('mongodb');
const Repository = require('./../../../core/repository');

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

class RideRepository extends Repository {
  constructor(model) {
    super(model);
  }

  async insertOne({ userId, driverRideId, from, to, fromPlace, toPlace, eventBookingId }) {
    const result = await this.model.insertOne({
      driverRideId,
      userId,
      from,
      to,
      fromPlace,
      toPlace,
      eventBookingId,
      pending: true,
      driver: null,
      createdAt: moment().utc().toISOString(),
    });

    return result.ops[0];
  }

  findById (id) {
    const oid = getObjectId(id);
    if (!oid) {
      return null;
    }
    return this.model.findOne({ _id: oid });
  }

  findWhere({ id, userId }) {
    const oid = getObjectId(id);
    return this.model.find(
        {
        ...(oid && { _id: oid }),
        ...(userId && { userId }),
        },
      ).toArray();
  }

  deleteOne (id) {
    const oid = getObjectId(id);
    if (!oid) {
      return null;
    }
    return this.model.deleteOne({ _id: oid });
  }

  findExisting (user, driverRide) {
    return this.model.find({ user, driverRide }).toArray();
  }

  async updateOne (id, { driverRide, fromAddress, toAddress, fromPlace, toPlace }) {
    const oid = getObjectId(id);
    const result = await this.this.model.findOneAndUpdate(
      {
        _id: oid,
      },
      {
        $set: {
          ...(driverRide && { driverRide }),
          ...(fromAddress && { fromAddress }),
          ...(toAddress && { toAddress }),
          ...(fromPlace && { fromPlace }),
          ...(toPlace && { toPlace }),
        },
      },
      {
        returnOriginal: false,
        returnNewDocument: true,
      },
    );
    return result.value;
  }

  accept (id, driver) {
    const oid = getObjectId(id);
    if (!oid) {
      return null;
    }
    return this.model.findOneAndUpdate({ _id: oid }, { $set: { pending: false, driver }});
  }
}

const newRideRepository = (model) => new RideRepository(model);

module.exports = newRideRepository;
