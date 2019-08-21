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
  constructor(model) {
    super(model);
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

  async updateOne(id, { rides, offers }) {
    const oid = getObjectId(id);
    const result = await this.model.findOneAndUpdate(
      {
        _id: oid,
      },
      {
        $set: {
          ...(rides && { rides }),
          ...(offers && { offers }),
        }
      },
      {
        returnOriginal: false,
        returnNewDocument: true,
      },
    );
    return result.value;
  }

  findAllUserEventBookings(userId) {
    return this.model.find({ userId }).toArray();
  }

  findById(id) {
    const oid = getObjectId(id);
    if (!oid) {
      return null;
    }
    return this.model.findOne({ _id: oid });
  }

  addRide(id, driverRideId) {
    return this._addToArray(id, 'rides', driverRideId);
  }

  updateRides(id, rides) {
    return this._setField(id, 'rides', rides);
  }

  removeRide(id, driverRideId) {
    return this._removeFromArray(id, 'rides', driverRideId);
  }

  addBooking(id, bookingId) {
    return this._addToArray(id, 'bookings', bookingId);
  }

  removeBooking(id, bookingId) {
    return this._removeFromArray(id, 'bookings', bookingId);
  }
}

const newEventBookingRepository = (model) => new EventBookingRepository(model);

module.exports = newEventBookingRepository;
