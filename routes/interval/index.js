const moment = require('moment');
const crypto = require('crypto');

const ErrorResponse = require('./../../core/errorResponse');

module.exports = (app, Interval, Offer) => {
  // Get Booking Intervals for the specific place
  app.get('/api/place/:id/intervals', async (req, res, next) => {
    try {
      const id = parseInt(req.params.id);
      const interval = await Interval.findOne({ place: id });

      if (!interval) {
        throw ErrorResponse.NotFound('No such intervals');
      }

      return res.status(200).json(toIntervalViewModel(interval));
    } catch (error) {
      return next(error);
    }
  });

  app.put('/api/place/:id/intervals/:intervalId', async (req, res, next) => {
    try {
      const placeId = parseInt(req.params.id);
      const intervalId = parseInt(req.params.intervalId);
      const { slotId } = req.body;

      if (!placeId || !intervalId) {
        throw ErrorResponse.BadRequest('missing placeId or intervalId')
      }

      let interval = await Interval.findOne({ _id: intervalId, place: placeId });
      if (!interval) {
        throw ErrorResponse.NotFound('interval not found');
      }

      const isValid = validateSingleInterval(req.body);
      const isOfferValid = await validateOffers(req.body.offers, placeId);

      if (!isValid || !isOfferValid) {
        throw ErrorResponse.BadRequest('Interval not valid: should have start, end, slots, day: (english day of week)');
      }

      if (!slotId) {
        interval.intervals.push({
          start: req.body.start,
          end: req.body.end,
          slots: req.body.slots,
          day: req.body.day,
          offers: req.body.offers
        });
        await Interval.replaceOne({ _id: intervalId }, interval);

        return res.status(200).json({ message: 'added', interval: toIntervalViewModel(interval) });
      }

      interval.intervals = interval.intervals.map(interval => {
        let id = crypto.createHash('sha1').update(`${interval.start}${interval.end}${interval.day}`).digest('hex');

        if (id === slotId) {
          interval = {
            ...interval,
            start: req.body.start,
            end: req.body.end,
            day: req.body.day,
            slots: req.body.slots,
            offers: req.body.offers,
          }
        }

        return interval;
      });
      await Interval.replaceOne({ _id: intervalId }, interval);

      return res.status(200).json({ message: 'updated', interval: toIntervalViewModel(interval) });
    } catch (error) {
      return next(error);
    }
  });

  app.delete('/api/place/:id/intervals/:intervalId', async (req, res, next) => {
    try {
      const placeId = parseInt(req.params.id);
      const intervalId = parseInt(req.params.intervalId);
      const { slotId } = req.body;

      if (!placeId || !intervalId || !slotId) {
        throw ErrorResponse.BadRequest('missing parameters, required placeId, intervalId, slotId');
      }

      const interval = await Interval.findOne({ _id: intervalId, place: placeId });
      if (!interval) {
        throw ErrorResponse.NotFound('interval not found');
      }
      interval.intervals = interval.intervals.map(interval => {
        interval._id = crypto.createHash('sha1').update(`${interval.start}${interval.end}${interval.day}`).digest("hex");
        return interval;
      });
      interval.intervals = interval.intervals.filter(interval => interval._id != slotId);
      interval.intervals = interval.intervals.map(interval => {
        delete interval._id;
        return interval;
      });
      await Interval.replaceOne({ _id: intervalId }, interval);

      return res.status(200).json({ message: 'updated', interval: toIntervalViewModel(interval) });
    } catch (error) {
      return next(error);
    }
  });

  
  toIntervalViewModel = (interval) => {
    interval.intervals = interval.intervals.map(interval => {
      interval._id = crypto.createHash('sha1').update(`${interval.start}${interval.end}${interval.day}`).digest("hex");
      return interval;
    });
    return interval;
  }

  validateIntervals = (intervals) => {
    let isValid = true;
    if (intervals && Array.isArray(intervals)) {
      intervals.forEach((interval) => {
        isValid = validateSingleInterval(interval);
        interval.slots = parseInt(interval.slots);
      });
    } else {
      isValid = false;
    }
    return isValid;
  }
  validateOffers = async (offers, placeId) => {
    const dBOffers = await Offer.find({ place: placeId }).toArray();
    let isValid = true;
    if (offers && Array.isArray(offers) && dBOffers && Array.isArray(dBOffers)) {
      offers.forEach(id => {
        if (!dBOffers.find(offer => offer._id === id)) {
          isValid = false;
        }
      });
    } else {
      isValid = false;
    }
    return isValid;
  }
  validateSingleInterval = (interval) => {
    const requiredProperties = ['start', 'end', 'day', 'slots'];
    const availableDays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
    const objectKeys = Object.keys(interval);

    for (const key of requiredProperties) {
      const foundKey = objectKeys.find(x => x === key);
      if (!foundKey) {
        return false;
      }

      if (foundKey === 'start') {
        if (moment(`2019-01-01 ${interval.start.replace('.', ':')}`).isValid()) {
          interval.start = moment(`2019-01-01 ${interval.start.replace('.', ':')}`).format('HH.mm');
        } else {
          return false;
        }
      }

      if (foundKey === 'end') {
        if (moment(`2019-01-01 ${interval.end.replace('.', ':')}`).isValid()) {
          interval.end = moment(`2019-01-01 ${interval.end.replace('.', ':')}`).format('HH.mm');
        } else {
          return false;
        }
      }

      if (foundKey === 'day' && !availableDays.find(x => x === interval[foundKey])) {
        return false;
      }
    }
    return true;
  }
}
