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
  constructor(model, client, requirementRepository, placeRepository, bookUtil) {
    super(model, client);
    this.requirementRepository = requirementRepository;
    this.placeRepository = placeRepository;
    this.bookUtil = bookUtil;
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

  findByPlaceId(id) {
    return this.model.find({ placeId: id }).toArray();
  }

  async joinRequirements(event) {
    return {
      ...event,
      requirements: await Promise.all(Object.entries(event.requirements)
        .map(async ([key, value]) => ({
            ...(await this.requirementRepository.findOneByName(key)),
            value,
        }))),
    };
  }

  async joinPlace(event) {
    return {
      ...event,
      place: await this.placeRepository.findById(event.placeId),
    }
  }

  async joinPlaceOffersPlace(placeOffer) {
    const place = await this.placeRepository.findById(placeOffer.placeId);
    let chosenInterval;
    try {
      const intervals = await this.bookUtil.getPlaceIntervals(placeOffer.placeId);
      chosenInterval = intervals.find(x => x._id == placeOffer.intervalId);
    } catch (error) {
      chosenInterval = null;
    }
    let date;
    if (chosenInterval && moment().format('dddd') !== chosenInterval.day) {
      let day;
      switch(chosenInterval.day) {
        case 'Monday': day = 1;
        case 'Tuesday': day = 2;
        case 'Wednesday': day = 3;
        case 'Thursday': day = 4;
        case 'Friday': day = 5;
        case 'Saturday': day = 6;
        case 'Sunday': day = 7;
      }
      if (moment().day() <= day) { 
        date = moment().isoWeekday(day);
      } else {
        date = moment().add(1, 'weeks').isoWeekday(day);
      }
    } else {
      date = moment();
    }
    return {
      ...placeOffer,
      place: {
        _id: place._id,
        name: place.name,
        mainImage: place.mainImage,
        address: place.address,
        coordinates: (place.location || {}).coordinates,
        ...(chosenInterval && { freeSpots: (await this.bookUtil.validateIntervalSlots(chosenInterval, date, place)).free }),
      },
    }
  }
}

const newEventRepository = (
  model,
  client,
  requirementRepository,
  placeRepository,
  bookUtil,
) => new EventRepository(model, client, requirementRepository, placeRepository, bookUtil);

module.exports = newEventRepository;
