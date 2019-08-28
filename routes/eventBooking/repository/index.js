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

class EventBookingRepository extends Repository {
  constructor(model, client) {
    super(model, client);
  }

  async insertOne ({ eventId, userId, bookings }) {
    const result = await this.model.insertOne({
      eventId,
      userId,
      rides: [],
      bookings: bookings || [],
      createdAt: moment().utc().toISOString(),
    });

    return result.ops[0];
  }

  deleteOne (id) {
    const oid = getObjectId(id);
    if (!oid) {
      throw new Error('Wrong id!');
    }
    return this.model.deleteOne({ _id: oid });
  }

  async updateOne(id, { bookings }) {
    const oid = getObjectId(id);
    const result = await this.model.findOneAndUpdate(
      {
        _id: oid,
      },
      {
        $set: {
          ...(bookings && { bookings }),
        }
      },
      {
        returnOriginal: false,
        returnNewDocument: true,
      },
    );
    return result.value;
  }

  findWhere({ id, userId }) {
    const oid = getObjectId(id);
    return new Promise((resolve, reject) => {
      this.model.find(
        {
        ...(oid && { _id: oid }),
        ...(userId && { userId }),
        },
      ).toArray((err, events) => {
          if (err) reject(err);
          resolve(events);
        });
      });
  }

  findById(id) {
    const oid = getObjectId(id);
    if (!oid) {
      return null;
    }
    return this.model.findOne({ _id: oid });
  }

  addRide(id, ride) {
    return this._addToArray(id, 'rides', ride);
  }

  updateRides(id, rides) {
    return this._setField(id, 'rides', rides);
  }

  removeRide(id, ride) {
    return this._removeFromArray(id, 'rides', ride);
  }

  addBooking(id, bookingId) {
    return this._addToArray(id, 'bookings', bookingId);
  }

  removeBooking(id, bookingId) {
    return this._removeFromArray(id, 'bookings', bookingId);
  }

  findAllForUser(userId) {
    return this.model.find({ userId }).toArray();
  }
}

const newEventBookingRepository = (model, client) => new EventBookingRepository(model, client);

module.exports = newEventBookingRepository;
