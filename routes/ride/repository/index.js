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
  constructor(model, client, driverRideRepository, userRepository, placeRepository) {
    super(model, client);
    this.driverRideRepository = driverRideRepository;
    this.userRepository = userRepository;
    this.placeRepository = placeRepository;
  }

  async insertOne({ userId, driverRideId, from, to, fromPlace, toPlace, eventBookingId, pending = true, driver = null }) {
    const result = await this.model.insertOne({
      driverRideId,
      userId,
      from,
      to,
      fromPlace,
      toPlace,
      eventBookingId,
      pending,
      driver,
      arrived: false,
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

  findMany(ids) {
    const mappedIds = ids.map(id => getObjectId(id));
    return this.model.find({ _id: { $in: mappedIds }}).toArray();
  }

  findWhere({ id, userId, pending, fromPlace, toPlace }) {
    const oid = getObjectId(id);
    return this.model.find(
        {
        ...(oid && { _id: oid }),
        ...(userId && { userId }),
        ...(pending && { pending }),
        ...(fromPlace !== undefined && { fromPlace }),
        ...(toPlace !== undefined && { toPlace }),
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

  async updateOne (id, userId, {
    driverRideId,
    from,
    to,
    fromPlace,
    toPlace,
    eventBookingId,
    pending,
    driver,
    arrived,
  }) {
    const oid = getObjectId(id);
    const result = await this.model.findOneAndUpdate(
      {
        _id: oid,
        userId,
      },
      {
        $set: {
          ...(driverRideId && { driverRideId }),
          ...(from && { from }),
          ...(to && { to }),
          ...(fromPlace !== undefined && { fromPlace }),
          ...(toPlace !== undefined && { toPlace }),
          ...(eventBookingId && { eventBookingId }),
          ...(pending && { pending }),
          ...(driver && { driver }),
          ...(arrived && { arrived }),
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

  findCurrentDriverRides (driverId) {
    return this.model.find({ driver: String(driverId), arrived: false }).toArray();
  }

  async joinDriverRide (ride) {
    return { ...ride, driverRide: await this.driverRideRepository.findById(ride.driverRideId) };
  }

  async joinUser (ride) {
    return { ...ride, user: await this.userRepository.findById(ride.userId) };
  }

  async joinPlaces (ride) {
    return {
      ...ride,
      fromPlace: ride.fromPlace ? await this.placeRepository.findById(ride.fromPlace) : null,
      toPlace: ride.toPlace ? await this.placeRepository.findById(ride.toPlace) : null,
    };
  }
}

const newRideRepository = (
  model,
  client,
  driverRideRepository,
  userRepository,
  placeRepository,
) => new RideRepository(model, client, driverRideRepository, userRepository, placeRepository);

module.exports = newRideRepository;
