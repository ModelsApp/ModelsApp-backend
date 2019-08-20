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
  constructor(model) {
    super(model);
  }

  async insertOne ({ requirements, placesOffers, timeframe }) {
    if (timeframe) {
      timeframe.start = moment(timeframe.start).toISOString();
      timeframe.end = moment(timeframe.end).toISOString();
    }

    const result = await this.model.insertOne({
      requirements,
      placesOffers,
      timeframe,
      participants: [],
      createdAt: moment().utc().toISOString(),
    });

    return result.ops[0];
  }

  async updateOne(id, { requirements, placesOffers, timeframe }) {
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
        }
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

  addPlaceOffers(id, placeOffers) {
    return this._addToArray(id, 'placesOffers', placeOffers);
  }

  setPlacesOffers(id, placesOffers) {
    return this._setField(id, 'placesOffers', placesOffers);
  }

  removePlaceOffers(id, placeId) {
    return this._removeFromArray(id, 'placesOffers', { placeId });
  }

  bookEvent(id, userId) {
    return this._addToArray(id, 'participants', userId);
  }

  unbookEvent(id, userId) {
    return this._removeFromArray(id, 'participants', userId);
  }
}

const newEventRepository = (model) => new EventRepository(model);

module.exports = newEventRepository;
