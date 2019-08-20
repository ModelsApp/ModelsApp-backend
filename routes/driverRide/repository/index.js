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
  constructor(model) {
    super(model);
  }

  async insertOne({ driverId, from, to, timeframe }) {
    if (timeframe) {
      timeframe.start = moment(timeframe.start).toISOString();
      timeframe.end = moment(timeframe.end).toISOString();
    }

    const result = await this.model.insertOne({
      driverId,
      from,
      to,
      timeframe,
      passengers: [],
      createdAt: moment().utc().toISOString(),
    });

    return result.ops[0];
  }

  updateOrCreate(car, name, picture) {
    return new Promise((resolve, reject) => {
      this.model.findOneAndUpdate(
        {
          name,
        },
        {
          $set: {
            car,
            name,
            picture,
            createdAt: moment().utc().toISOString(),
          }
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
  }

  findWhere ({ id, driverId }) {
    const oid = getObjectId(id);
    return new Promise((resolve, reject) => {
      this.model.find(
        {
        ...(oid && { _id: oid }),
        ...(driverId && { driverId }),
        },
      ).toArray((err, results) => {
          if (err) reject(err);
          resolve(results);
        });
      });
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

  async updateOne (id, { driverId, from, to, timeframe, passengers }) {
    const oid = getObjectId(id);
    const result = await this.this.model.findOneAndUpdate(
      {
        _id: oid,
      },
      {
        $set: {
          ...(driverId && { driverId }),
          ...(from && { from }),
          ...(to && { to }),
          ...(timeframe && { timeframe }),
          ...(passengers && { passengers }),
        },
      },
      {
        returnOriginal: false,
        returnNewDocument: true,
      },
    );
    return result.value;
  }

  addPassenger(id, passenger) {
    return this._addToArray(id, 'passengers', passenger);
  }
  
  removePassenger(id, passenger) {
    return this._removeFromArray(id, 'passengers', passenger);
  }
}

const newDriverRideRepository = (model) => new DriverRideRepository(model);

module.exports = newDriverRideRepository;
