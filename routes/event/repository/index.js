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

class EventRepository extends Repository {
  constructor(model, requirementRepository, placeRepository) {
    super(model);
    this.requirementRepository = requirementRepository;
    this.placeRepository = placeRepository;
  }

  async insertOne ({ placeId, requirements, placesOffers, timeframe, baseCredits, level }) {
    if (timeframe) {
      timeframe.start = moment(timeframe.start).toISOString();
      timeframe.end = moment(timeframe.end).toISOString();
    }

    const result = await this.model.insertOne({
      placeId,
      requirements,
      placesOffers,
      timeframe,
      participants: [],
      baseCredits,
      level,
      createdAt: moment().utc().toISOString(),
    });

    return result.ops[0];
  }

  async updateOne(id, { requirements, placesOffers, timeframe, placeId }) {
    const oid = getObjectId(id);
    const result = await this.model.findOneAndUpdate(
      {
        _id: oid,
      },
      {
        $set: {
          ...(requirements && { requirements }),
          ...(timeframe && { timeframe }),
          ...(placesOffers && { placesOffers }),
          ...(placeId && { placeId }),
        }
      },
      {
        returnOriginal: false,
        returnNewDocument: true,
      },
    );
    return result.value;
  }

  findActivePlaceEvent(placeId) {
    const now = moment().utc().toISOString();
    return this.model.findOne({ placeId, 'timeframe.end': { $gte: now } });
  }

  findWhere({ id }) {
    const oid = getObjectId(id);
    return new Promise((resolve, reject) => {
      this.model.find(
        {
        ...(oid && { _id: oid }),
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

  deleteOne (id) {
    const oid = getObjectId(id);
    if (!oid) {
      throw new Error('Wrong id!');
    }
    return this.model.deleteOne({ _id: oid });
  }

  addPlaceOffers(id, placeOffers) {
    return this._addToArray(id, 'placesOffers', placeOffers);
  }

  setPlacesOffers(id, placesOffers) {
    return this._setField(id, 'placesOffers', placesOffers);
  }

  removePlaceOffers(id, placeId) {
    return this._removeFromArray(id, 'placesOffers', { placeId });
  }

  async bookEvent(id, userId) {
    await this.model.updateOne({ id }, { $inc: { 'timeframe.freeSpots': -1 } });
    return this._addToArray(id, 'participants', userId);
  }

  async unbookEvent(id, userId) {
    await this.model.updateOne({ id }, { $inc: { 'timeframe.freeSpots': 1 } });
    return this._removeFromArray(id, 'participants', userId);
  }

  async joinRequirements(event) {
    return {
      ...event,
      requirements: await Object.entries(event.requirements)
        .reduce(async (acc, [key, value]) => ({
          ...(await acc),
          [key]: {
            ...(await this.requirementRepository.findOneByName(key)),
            value,
          }
        }), Promise.resolve({})),
    };
  }

  async joinPlace(event) {
    return {
      ...event,
      place: await this.placeRepository.findById(event.placeId),
    }
  }
}

const newEventRepository = (
  model,
  requirementRepository,
  placeRepository,
) => new EventRepository(model, requirementRepository, placeRepository);

module.exports = newEventRepository;
