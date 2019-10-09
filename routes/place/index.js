const _ = require('lodash');
const moment = require('moment');
const multiparty = require('multiparty');
const crypto = require('crypto');

const middleware = require('../../config/authMiddleware');
const imageUploader = require('../../lib/imageUplader');
const newPostPlaceSchema = require('./schema/postPlace');
const newEditPlaceSchema = require('./schema/editPlace');
const deleteNotificationReceiverSchema = require('./schema/deleteNotificationReceiver');
const newPostNotificationSchema = require('./schema/postNotification');
const postNotificationReceiversSchema = require('./schema/postNotificationReceivers');
const ErrorResponse = require('./../../core/errorResponse');
const { ACCESS } = require('./constant');
const { GENDERS } = require('./../user/constant');
const { BOOKING_LIMIT_PERIODS } = require('./constant');
const sendGrid = require('../../lib/sendGrid');

module.exports = (
  app,
  placeRepository,
  placeTypeRepository,
  placeExtraRepository,
  placeTimeFramesRepository,
  cityRepository,
  eventRepository,
  requirementRepository,
  deleteEvent,
  placeUtil,
  validate,
  User, Place, Offer, Counter, Booking, OfferPost, Interval, SamplePost, getNewId,
) => {
  app.get('/api/place/:id/daysOffs', async (req, res, next) => {
    try {
      const id = parseInt(req.params.id);
      if (!id) throw ErrorResponse.BadRequest('id is required');

      const place = await Place.findOne({ _id: id });
      if (!place) throw ErrorResponse.NotFound('place not found');

      return res.status(200).json({ daysOff: place.daysOffs });
    } catch (error) {
      return next(error);
    }
  });

  app.post('/api/place/notification', middleware.isAuthorized, async (req, res, next) => {
    try {
      const validation = validate(req.body, newPostNotificationSchema());
      if (validation.error) throw ErrorResponse.BadRequest(validation.error);
      const { placeId, userId, date } = req.body;

      let formattedDate = moment(date);
      if (!formattedDate.isValid()) {
        throw ErrorResponse.BadRequest(`Keys in notifyUsersBooking must be a date! Got ${date}`);
      }
      formattedDate = formattedDate.format('DD-MM-YYYY');

      const place = await placeRepository.findOne(placeId);
      if (!place) throw ErrorResponse.NotFound('place not found');

      let { notifyUsersBooking } = place;
      if (!notifyUsersBooking) {
        notifyUsersBooking = {};
      }
      if (!notifyUsersBooking[formattedDate]) {
        notifyUsersBooking[formattedDate] = [];
      }

      const user = await User.findOne({ _id: userId });
      if (!user) throw ErrorResponse.NotFound('user not found');
      if (!user.devices || !user.devices.length) throw ErrorResponse.BadRequest('user has no devices');

      for (const device of user.devices) {
        if (notifyUsersBooking[formattedDate]
          .every((presentDevice) => JSON.stringify(presentDevice) !== JSON.stringify(device))) {
          notifyUsersBooking[formattedDate].push(device);
        }
      }
      await placeRepository.findOneAndUpdate(placeId, { $set: { notifyUsersBooking } });

      return res.status(200).json({ message: 'ok' });
    } catch (error) {
      return next(error);
    }
  });

  function timeFramesValid(validTimeFrames, timeFrames) {
    return Object.values(timeFrames)
      .every((daytimeFrames) => daytimeFrames.every(timeFrame => validTimeFrames.includes(timeFrame)));
  }

  // New Place
  app.post('/api/place', async (req, res, next) => {
    try {
      const validTypes = (await placeTypeRepository.find({}, { projection: { type: 1 } }))
        .map(placeType => placeType.type);
      const validExtras = (await placeExtraRepository.find({}, { projection: { name: 1 } }))
        .map(placeExtra => placeExtra.name);
      const validCities = (await cityRepository.find({}, { projection: { name: 1 } }))
        .map(city => city.name);
      const allRequirements = await requirementRepository.getAll();
      const validation = validate(req.body, newPostPlaceSchema(validTypes, validExtras, validCities, allRequirements));

      if (validation.error) throw ErrorResponse.BadRequest(validation.error);

      const { timeFrames } = req.body;
      const validTimeFrames = (await placeTimeFramesRepository.find({ type: req.body.type }))
        .map(placeTimeFrame => placeTimeFrame.name);
      if (timeFrames && !timeFramesValid(validTimeFrames, timeFrames)) {
        throw ErrorResponse
          .BadRequest(`Invalid time frames! Valid values for type ${req.body.type} are ${validTimeFrames || '[]'}`);
      }

      const place = {
        name: req.body.name,
        type: req.body.type,
        address: req.body.address,
        photos: req.body.photos,
        location: {
          type: 'Point',
          coordinates: [parseFloat(req.body.coordinates[0]), parseFloat(req.body.coordinates[1])],
        },
        socials: req.body.socials ?
          {
            facebook: req.body.socials.facebook || '',
            tripAdvisor: req.body.socials.tripAdvisor || '',
            google: req.body.socials.google || '',
            yelp: req.body.socials.yelp || '',
            instagram: req.body.socials.instagram || '',
          }
          : {},
        level: parseInt(req.body.level),
        description: req.body.description,
        schedule: req.body.schedule,
        slots: parseInt(req.body.slots),
        creationDate: moment().format('DD-MM-YYYY'),
        extra: req.body.extra || [],
        credits: 0,
        bookings: [],
        offers: [],
        posts: [],
        notificationRecivers: [],
        images: [],
        mainImage: null,
        instapage: null,
        daysOffs: [],
        isActive: true,
        access: ACCESS.basic,
        allows: Object.values(GENDERS),
        timeFrames: req.body.timeFrames || {},
        bookingLimits: req.body.bookingLimits || {},
        bookingLimitsPeriod: req.body.bookingLimitsPeriod || BOOKING_LIMIT_PERIODS.week,
        city: req.body.city,
        requirements: req.body.requirements,
      };

      const seq = await Counter.findOneAndUpdate(
        { _id: 'placeid' },
        { $inc: { seq: 1 } },
        { new: true },
      );
      place._id = seq.value.seq;

      const placeInserted = await Place.insertOne(place);
      const id = await getNewId('intervalsid');
      const interval = {
        _id: id,
        place: seq.value.seq,
        intervals: [],
      };
      await Interval.insertOne(interval);

      return res.status(201).json(placeInserted.ops[0]);
    } catch (error) {
      return next(error);
    }
  });

  // Edit Place
  app.put('/api/place/:id', async (req, res, next) => {
    try {
      const id = parseInt(req.params.id);
      const newPlace = req.body;
      const validTypes = (await placeTypeRepository.find({}, { projection: { type: 1 } }))
        .map(placeType => placeType.type);
      const validExtras = (await placeExtraRepository.find({}, { projection: { name: 1 } }))
        .map(placeExtra => placeExtra.name);
      const validCities = (await cityRepository.find({}, { projection: { name: 1 } }))
        .map(city => city.name);
      const allRequirements = await requirementRepository.getAll();
      const validation = validate(newPlace, newEditPlaceSchema(validTypes, validExtras, validCities, allRequirements));
      if (validation.error) throw ErrorResponse.BadRequest(validation.error);

      const place = await Place.findOne({ _id: id });
      if (!place) throw ErrorResponse.NotFound('place not found');

      if (newPlace.isActive !== place.isActive) place.isActive = newPlace.isActive;
      if (newPlace.phone !== place.phone && newPlace.phone) place.phone = newPlace.phone;
      if (newPlace.instapage !== place.instapage && newPlace.instapage) place.instapage = newPlace.instapage;
      if (newPlace.name !== place.name && newPlace.name) place.name = newPlace.name;
      if (newPlace.type !== place.type && newPlace.type) place.type = newPlace.type;
      if (newPlace.address !== place.address && newPlace.address) place.address = newPlace.address;
      if (newPlace.photos !== place.photos && newPlace.photos) place.photos = newPlace.photos;
      if (newPlace.description !== place.description && newPlace.description) place.description = newPlace.description;
      if (newPlace.slots !== place.slots && newPlace.slots) place.slots = newPlace.slots;
      if (newPlace.level !== place.level && newPlace.level) place.level = newPlace.level;
      if (newPlace.socials) {
        if (newPlace.socials.facebook !== place.socials.facebook && newPlace.socials.facebook) place.socials.facebook = newPlace.socials.facebook;
        if (newPlace.socials.google !== place.socials.google && newPlace.socials.google) place.socials.google = newPlace.socials.google;
        if (newPlace.socials.tripAdvisor !== place.socials.tripAdvisor && newPlace.socials.tripAdvisor) place.socials.tripAdvisor = newPlace.socials.tripAdvisor;
        if (newPlace.socials.yelp !== place.socials.yelp && newPlace.socials.yelp) place.socials.yelp = newPlace.socials.yelp;
        if (newPlace.socials.instagram !== place.socials.instagram && newPlace.socials.instagram) place.socials.instagram = newPlace.socials.instagram;
      }
      if (newPlace.schedule) {
        if (newPlace.schedule.monday !== place.schedule.monday && newPlace.schedule.monday) place.schedule.monday = newPlace.schedule.monday;
        if (newPlace.schedule.tuesday !== place.schedule.tuesday && newPlace.schedule.tuesday) place.schedule.tuesday = newPlace.schedule.tuesday;
        if (newPlace.schedule.wednesday !== place.schedule.wednesday && newPlace.schedule.wednesday) place.schedule.wednesday = newPlace.schedule.wednesday;
        if (newPlace.schedule.thursday !== place.schedule.thursday && newPlace.schedule.thursday) place.schedule.thursday = newPlace.schedule.thursday;
        if (newPlace.schedule.friday !== place.schedule.friday && newPlace.schedule.friday) place.schedule.friday = newPlace.schedule.friday;
        if (newPlace.schedule.saturday !== place.schedule.saturday && newPlace.schedule.saturday) place.schedule.saturday = newPlace.schedule.saturday;
        if (newPlace.schedule.sunday !== place.schedule.sunday && newPlace.schedule.sunday) place.schedule.sunday = newPlace.schedule.sunday;
      }
      if (newPlace.location) {
        if (newPlace.location.coordinates[0] !== place.location.coordinates[0] && newPlace.location.coordinates[0]) place.location.coordinates[0] = parseFloat(newPlace.location.coordinates[0]);
        if (newPlace.location.coordinates[1] !== place.location.coordinates[1] && newPlace.location.coordinates[1]) place.location.coordinates[1] = parseFloat(newPlace.location.coordinates[1]);
      }

      if (newPlace.photo) place.photos.push(newPlace.photo);
      if (newPlace.photos) place.photos.concat(newPlace.photos);
      if (newPlace.extra) place.extra = newPlace.extra;
      if (newPlace.access) place.access = newPlace.access;
      if (newPlace.allows) place.allows = newPlace.allows;
      if (newPlace.timeFrames) {
        const validTimeFrames = (await placeTimeFramesRepository.find({ type: newPlace.type || place.type }))
          .map(placeTimeFrame => placeTimeFrame.name);
        if (!timeFramesValid(validTimeFrames, newPlace.timeFrames)) {
          return res.status(400)
            .json({ message: `Invalid time frames! Valid values for type ${newPlace.type || place.type} are ${validTimeFrames || '[]'}` });
        }
        place.timeFrames = newPlace.timeFrames;
      }
      if (newPlace.bookingLimits) place.bookingLimits = newPlace.bookingLimits;
      if (newPlace.bookingLimitsPeriod) place.bookingLimitsPeriod = newPlace.bookingLimitsPeriod;
      if (newPlace.city) place.city = newPlace.city;
      if (newPlace.requirements) place.requirements = newPlace.requirements;

      await Place.replaceOne({ _id: id }, newPlace);

      return res.status(201).json({ message: 'place updated' });
    } catch (error) {
      return next(error);
    }
  });

  // Find all the places near the specified coordinate
  app.get('/api/place/near', async (req, res, next) => {
    try {
      const lat = parseFloat(req.query.lat);
      const long = parseFloat(req.query.long);
      const { radius } = req.query;
    
      const places = await Place.find({
        location: {
          $nearSphere: {
            $geometry: { type: "Point", coordinates: [lat, long] },
            $maxDistance: radius * 1000,
          },
        },
      }, { projection: { client: 0 } }).toArray()
      if (!places) {
        return res.status(200).json([]);
      }
      const extendedData = await getMoreData(places);
    
      return res.status(200).json(extendedData); 
    } catch (error) {
      return next(error);
    }
  });

  app.post('/api/place/client/forgotPassword', async (req, res, next) => {
    try {
      const { email } = req.body;
      if (!email) throw ErrorResponse.BadRequest('provide email');

      const place = await placeRepository.findByClientEmail(email);
      if (!place) throw ErrorResponse.NotFound('given email is not registered');

      const temporaryPassword = crypto.randomBytes(2).toString('hex');
      await placeRepository.setClientTempPass(place._id, temporaryPassword);

      await sendGrid.sendForgotPasswordEmail(temporaryPassword, { email });

      return res.status(200).json({ message: `an email with instructions was sent to ${email}` });
    } catch (error) {
      return next(error);
    }
  });

  app.post('/api/place/client/changePassword', middleware.isClient, async (req, res, next) => {
    try {
      const place = await req.user;
      const { password, confirmPassword } = req.body;
      if (!password || !confirmPassword || password !== confirmPassword) {
        throw ErrorResponse.BadRequest('passwords dont match');
      }
      await placeRepository.setClientPass(place._id, password);

      return res.status(200).json({ message: 'password has been updated' });
    } catch (error) {
      return next(error);
    }
  });

  // Get concrete Place and give it Offers, Bookings and Intervals from another entities
  app.get('/api/place/:id', async (req, res, next) => {
    try {
      const id = parseInt(req.params.id);
      let place = await Place.findOne({ _id: id, isActive: true }, { projection: { client: 0 } });
      if (!place) throw ErrorResponse.NotFound('no such place');
      const interval = await Interval.findOne({ place: place._id });
      const books = await Booking.find({ place: place._id, closed: false }).toArray();
      const offers = await Offer.find({ place: place._id, closed: false }).sort({ price: 1 }).toArray();

      place.minOffer = null;
      if (offers.length) {
        place.minOffer = offers[0]['price'];
      }

      if (interval) place.intervals = interval.intervals;
      place.bookings = books;
      place.offers = offers;
      const icons = await placeUtil.getPlaceIcons(place);
      let event = await eventRepository.findActivePlaceEvent(place._id);
      if (event) {
        event = await eventRepository.joinRequirements(event);
        event.placesOffers = await Promise.all(
          event.placesOffers.map(
            (placeOffer) => eventRepository.joinPlaceOffersPlace(placeOffer)
          ));
        event.placesOffers = await Promise.all(
          event.placesOffers.map(
            (placeOffer) => eventRepository.joinPlaceOffersOffers(placeOffer),
          ));
        event.placesOffers = await Promise.all(
          event.placesOffers.map(
            (placeOffer) => eventRepository.joinPlaceOffersInterval(placeOffer),
          ));
      }
      place = await placeRepository.joinRequirements(place);

      return res.status(200).json({ ...place, icons, event });
    } catch (error) {
      return next(error);
    }
  });

  app.post('/api/place/:id/notification-receivers', async (req, res, next) => {
    try {
      const id = parseInt(req.params.id);
      const validation = validate(req.body, postNotificationReceiversSchema);

      if (validation.error) throw ErrorResponse.BadRequest(validation.error);
      if (!id) throw ErrorResponse.BadRequest('Specify id');

      const place = await Place.findOneAndUpdate(
        { _id: id },
        { $set: { notificationRecivers: req.body.receivers } },
        {
          returnOriginal: false,
          returnNewDocument: true,
        },
      );

      return res.status(200).json(place.value.notificationRecivers);
    } catch (error) {
      return next(error);
    }
  });

  app.delete('/api/place/:id/notification-receivers', async (req, res, next) => {
    try {
      const id = parseInt(req.params.id);
      if (!id) throw ErrorResponse.BadRequest('Please specify place id');

      const validation = validate(req.body, deleteNotificationReceiverSchema);
      if (validation.error) throw ErrorResponse.BadRequest(validation.error);

      const place = await Place.findOne({ _id: id });
      if (!place) throw ErrorResponse.NotFound('Wrong id');

      const { notificationRecivers } = place;
      const newReceivers = notificationRecivers.filter(receiver => receiver.email !== req.body.email);

      const newPlace = await Place.findOneAndUpdate({ _id: id }, { $set: { notificationRecivers: newReceivers } });

      return res.status(200).json(newPlace.value.notificationRecivers);
    } catch (error) {
      return next(error);
    }
  });

  app.get('/api/place/:id/notification-receivers', async (req, res, next) => {
    try {
      const id = parseInt(req.params.id);
      if (!id) throw ErrorResponse.BadRequest('id is required');
      
      const place = await Place.findOne({ _id: id });

      return res.status(200).json(place.notificationRecivers);
    } catch (error) {
      return next(error);
    }
  });

  // Get all Places with limit and offset
  app.get('/api/place/:limit/:offset', async (req, res, next) => {
    try {
      const limit = parseInt(req.params.limit);
      const offset = parseInt(req.params.offset);
      const places = await Place.find(
        {},
        { projection: { client: 0 } },
        ).skip((offset - 1) * limit)
        .limit(limit)
        .toArray();
      const extendedData = await getMoreData(places);

      return res.status(200).json(extendedData);
    } catch (error) {
      return next(error);
    }
  });

  async function getPlaceQuery(ids, typology, extra, timeframe, date, city) {
    const query = { $or: [] };
    const defaultQuery = { isActive: true };

    if (ids) {
      let idsArr = ids;
      if (!Array.isArray(ids)) {
        idsArr = [idsArr];
      }
      idsArr = idsArr.map(id => parseInt(id));
      defaultQuery._id = { $in: idsArr };
    }

    if (city) {
      defaultQuery.city = city;
    }

    if (timeframe && date) {
      const day = moment(date).format('dddd');
      defaultQuery[`timeFrames.${day.toLowerCase()}`] = timeframe;
    }

    let typologies = typology;
    let extras = extra;

    if (typologies && !Array.isArray(typologies)) {
      typologies = [typologies];
    }
    if (extras && !Array.isArray(extras)) {
      extras = [extras];
    }

    // if both present, we need dot product
    if (typologies && extras) {
      for (const typology of typologies) {
        for (const extra of extras) {
          query.$or.push({ type: typology, extra, ...defaultQuery });
        }
      }
    } else if (typologies) {
      for (const typology of typologies) {
        query.$or.push({ type: typology, ...defaultQuery });
      }
    } else if (extras) {
      for (const extra of extras) {
        query.$or.push({ extra, ...defaultQuery });
      }
    } else {
      query.$or.push({ ...defaultQuery });
    }

    return query;
  }

  app.get('/api/v2/place', middleware.isAuthorized, async (req, res, next) => {
    try {
      const { id, typology, extra, city, timeframe, date } = req.query;
      if (date && !moment(date, 'YYYY-MM-DD').isValid()) {
        throw ErrorResponse.BadRequest('Incorrect date, use YYYY-MM-DD format');
      }
      const query = await getPlaceQuery(id, typology, extra, timeframe, date, city);
    
      const places = await placeRepository.findAllWhereExcludeFields(query, ['client']);
      const mappedPlaces = await Promise.all(places
        .map(async (place) => {
          let freeSpots;
          if (date) {
            freeSpots = await placeUtil.getPlaceFreeSpots(place, date);
          }
          const icons = await placeUtil.getPlaceIcons(place);
          return {
            _id: place._id,
            mainImage: place.mainImage,
            address: place.address,
            type: place.type,
            name: place.name,
            location: place.location,
            access: place.access,
            freeSpots,
            spots: place.spots,
            icons,
          }
        }));

      return res.status(200).json(mappedPlaces.sort((a, b) => b.freeSpots - a.freeSpots));
    } catch (error) {
      return next(error);
    }
  });

  // Get all Places
  app.get('/api/place', async (req, res, next) => {
    try {
      const { id, typology, extra, city, timeframe, date } = req.query;
      const query = await getPlaceQuery(id, typology, extra, timeframe, date, city);
    
      const places = await placeRepository.findAllWhereExcludeFields(query, ['client']);
      const placesJoined = await getMoreData(places);
    
      return res.status(200).json(placesJoined);  
    } catch (error) {
      return next(error);
    }
  });

  // Get all Places
  app.get('/api/admin/place', async (req, res, next) => {
    try {
      const places = await Place.find({}, { projection: { client: 0 } }).toArray()
      const extraData = await getMoreData(places);
  
      return res.status(200).json(extraData);
    } catch (error) {
      return next(error);
    }
  });

  // Delete the place
  app.delete('/api/place/:id', async (req, res, next) => {
    try {
      const id = parseInt(req.params.id);
      const place = await Place.findOne({ _id: id });
      if (!place) throw ErrorResponse.NotFound('Place not found');

      const events = await eventRepository.findByPlaceId(id);
      for (const event of events) {
        await deleteEvent(event._id);
      }
      await Place.deleteOne({ _id: id });
      await Offer.deleteMany({ place: id });
      await Booking.deleteMany({ place: id });
      await OfferPost.deleteMany({ place: id });
      await SamplePost.deleteMany({ place: id });
      return res.json({ message: "Deleted" });
    } catch (error) {
      return next(error);
    }
  });

  app.delete('/api/place/:id/images', async (req, res, next) => {
    try {
      const id = parseInt(req.params.id);
      const { imageId } = req.body;
      if (!id) throw ErrorResponse.BadRequest('id is required');
    
      const place = await Place.findOne({ _id: id });
      if (!place) throw ErrorResponse.NotFound('place not found');
    
      const image = place.images.find(x => x.id === imageId);
      if (!image) throw ErrorResponse.BadRequest('image is for the wrong place');
      await imageUploader.deleteImage(image.cloudinaryId)
      await Place.findOneAndUpdate({ _id: id }, { $pull: { 'images': { 'id': image.id } } });
      if (place.mainImage === image.url) {
        await Place.findOneAndUpdate({ _id: id }, { $set: { mainImage: null } })
      }
    
      return res.status(200).json({ message: 'ok' });
    } catch (error) {
      return next(error);
    }
  });

  app.post('/api/place/:id/images', async (req, res, next) => {
    try {
      const id = parseInt(req.params.id);
      if (!id) throw ErrorResponse.BadRequest('id is required');

      const place = await Place.findOne({ _id: id });
      if (!place) throw ErrorResponse.NotFound('place not found');

      const form = new multiparty.Form();
      const result = await new Promise((resolve, reject) => form
        .parse(req, async (err, fields, files) => {
          if (err) reject(err);
          resolve({ fields, files });
        }));
      const { files } = result;
      if (!files) throw ErrorResponse.BadRequest('no files added');

      const { images } = files;
      for (const image of images) {
        const newImage = await imageUploader.uploadImage(image.path, 'places', place._id);
        await Place.findOneAndUpdate({ _id: id }, { $push: { images: newImage } });
      }

      return res.status(200).json({ message: 'ok' });
    } catch (error) {
      return next(error);
    }
  });

  app.post('/api/sss', async (req, res) => {
    const form = new multiparty.Form();
    const result = await new Promise((resolve, reject) => form
      .parse(req, async (err, fields, files) => {
        if (err) reject(err);
        resolve({ fields, files });
      }));
    const { files } = result;

    const newImage = await imageUploader.uploadImage(files.images[0].path, 'tester', 1);

    return res.status(200).json({ message: newImage });
  });

  app.post('/api/place/:id/daysOffs', async (req, res, next) => {
    try {
      const id = parseInt(req.params.id);
      const { daysOffs } = req.body;

      if (!id) throw ErrorResponse.BadRequest('id is required');
      if (!daysOffs) throw ErrorResponse.BadRequest('daysOffs is required');
      if (!validateDaysOff(daysOffs)) throw ErrorResponse.BadRequest('collection not valid');

      const place = await Place.findOne({ _id: id });
      if (!place) throw ErrorResponse.NotFound('place not found');

      place.daysOffs = daysOffs;
      await Place.replaceOne({ _id: place._id }, place);
      return res.status(200).json({ message: 'days off changed' });
    } catch (error) {
      return next(error);
    }
  });

  app.put('/api/place/:id/images/:imageId/main', async (req, res, next) => {
    try {
      const id = parseInt(req.params.id);
      const { imageId } = req.params;

      if (!id) throw ErrorResponse.BadRequest('id is required');
      if (!imageId) throw ErrorResponse.BadRequest('imageId is required');

      const place = await Place.findOne({ _id: id });

      if (!place || !place.images || !place.images.find(x => x.id === imageId)) {
        throw ErrorResponse.BadRequest('Place not found or wrong imageId');
      }

      await Place.findOneAndUpdate({ _id: id }, { $set: { 'images.$[].isMainImage': false } });
      const image = place.images.find(x => x.id == imageId);
      await Place.findOneAndUpdate(
        { _id: id },
        { $set: { mainImage: image.url, 'images.$[t].isMainImage': true } },
        { arrayFilters: [{ 't.id': imageId }] }
      );

      return res.status(200).json({ message: 'ok' });
    } catch (error) {
      return next(error);
    }
  });

  function rangesOverlap(start1, end1, start2, end2) {
    // case 1: range2 is subset
    if (start1 <= start2 && end1 >= end2) {
      return true;
    }

    // case 2: range2 overlaps from left
    if (start1 >= start2 && start1 <= end2 && end1 >= start1 && end1 >= end2) {
      return true;
    }

    // case 3: range2 overlaps from right
    if (start1 <= start2 && start1 <= end2 && end1 >= start1 && end1 <= end2) {
      return true;
    }

    return false;
  }

  app.get('/api/place/:id/booking/:bookingId/offers', async (req, res, next) => {
    try {
      const placeId = parseInt(req.params.id);
      const bookingId = parseInt(req.params.bookingId);

      if (!placeId) throw ErrorResponse.BadRequest('placeId is required');
      if (!bookingId) throw ErrorResponse.BadRequest('bookingId is required');

      const place = await Place.findOne({ _id: placeId });
      const booking = await Booking.findOne({ _id: bookingId });
      const interval = await Interval.findOne({ place: placeId });

      if (!place) throw ErrorResponse.NotFound('place not found');
      if (!booking) throw ErrorResponse.NotFound('booking not found');
      if (!interval) throw ErrorResponse.NotFound('interval not found');

      const slots = interval.intervals.filter(x => booking.day
        ? x.day === booking.day && rangesOverlap(Number(x.start), Number(x.end), Number(booking.startTime), Number(booking.endTime))
        : rangesOverlap(Number(x.start), Number(x.end), Number(booking.startTime), Number(booking.endTime))
      );

      const offers = await Offer.find({ place: placeId }).toArray();
      const availableOfferIds = Array.from(new Set(slots
        .map(slot => slot.offers)
        .reduce((acc, el) => acc.concat(el), [])
        ));
      let availableOffers = offers
        .filter(offer => availableOfferIds.includes(offer._id))
        .map(offer => ({ ...offer, isAvailable: true }));

      return res.status(200).json(availableOffers);
    } catch (error) {
      return next(error);
    }
  });

  function validateDaysOff(dayOffs) {
    const requiredProperties = ['date', 'isWholeDay', 'intervals'];
    for (dayOff of dayOffs) {
      const daysOff = Object.keys(dayOff);

      for (requiredProperty of requiredProperties) {
        const foundDayOff = daysOff.find(x => x === requiredProperty);
        if (!foundDayOff) return false;
        if (foundDayOff === 'date') {
          if (moment(dayOff.date).isValid()) {
            dayOff.date = moment(dayOff.date).format('DD-MM-YYYY');
            continue;
          } else {
            return false;
          }
        }
        if (foundDayOff === 'isWholeDay') {
          if (typeof dayOff.isWholeDay !== 'boolean') {
            return false;
          }
          continue;
        }
        if (foundDayOff !== 'intervals') return false
        
        for (const interval of dayOff['intervals']) {
          const intervalObjectKeys = Object.keys(interval);
          if (intervalObjectKeys.find(y => y === 'start') && intervalObjectKeys.find(y => y === 'end')
            && moment(`2019-01-01 ${interval.start.replace('.', ':')}`).isValid()
            && moment(`2019-01-01 ${interval.end.replace('.', ':')}`).isValid()
          ) {
            interval.start = moment(`2019-01-01 ${interval.start.replace('.', ':')}`).format('HH.mm');
            interval.end = moment(`2019-01-01 ${interval.end.replace('.', ':')}`).format('HH.mm');
          } else {
            return false;
          }
        }
      }
    }

    return true;
  }

  async function getMoreData(places) {
    return Promise.all(places.map(async (place) => {
      const interval = await Interval.findOne({ place: place._id });
      const bookings = await Booking.find({ place: place._id, closed: false }).toArray();
      const offers = await Offer.find({ place: place._id, closed: false }).toArray();

      place.minOffer = null;
      if (offers.length !== 0) {
        place.minOffer = offers[0]['price'];
      }

      if (interval) place.intervals = interval.intervals;
      place.bookings = bookings || [];
      place.offers = offers || [];

      return place;
    }));
  }  
};
