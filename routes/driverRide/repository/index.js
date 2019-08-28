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

class DriverRideRepository extends Repository {
  constructor(model, rideRepository) {
    super(model);
    this.rideRepository = rideRepository;
  }

  async insertOne ({ drivers, place, timeframe }) {
    if (timeframe) {
      timeframe.start = moment(timeframe.start).toISOString();
      timeframe.end = moment(timeframe.end).toISOString();
    }

    const result = await this.model.insertOne({
      drivers,
      place,
      timeframe,
      rides: [],
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

  deleteOne (id) {
    const oid = getObjectId(id);
    if (!oid) {
      throw new Error('Wrong id!');
    }
    return this.model.deleteOne({ _id: oid });
  }

  async updateOne (id, { drivers, passengers, place, timeframe }) {
    const oid = getObjectId(id);
    const result = await this.this.model.findOneAndUpdate(
      {
        _id: oid,
      },
      {
        $set: {
          ...(drivers && { drivers }),
          ...(place && { place }),
          ...(passengers && { passengers }),
          ...(timeframe && { timeframe }),
        },
      },
      {
        returnOriginal: false,
        returnNewDocument: true,
      },
    );
    return result.value;
  }

  findWhere({ id }) {
    const oid = getObjectId(id);
    return this.model.find(
        {
        ...(oid && { _id: oid }),
        },
      ).toArray();
  }

  addRide(id, ride) {
    return this._addToArray(id, 'rides', ride);
  }
  
  removeRide(id, ride) {
    return this._removeFromArray(id, 'rides', ride);
  }

  joinRides(driverRides) {
    return Promise.all(
      driverRides.map(async (dr) => ({
        ...dr,
        rides: await Promise.all(
          dr.rides.map(async (rideId) => await this.rideRepository.findById(rideId))
        )
      }),
      ));
  }

  findByDriverId(driverId) {
    return this.model.find({ drivers: String(driverId) }).toArray();
  }
}

const newDriverRideRepository = (model, rideRepository) => new DriverRideRepository(model, rideRepository);

module.exports = newDriverRideRepository;
