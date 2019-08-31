const _ = require('lodash');
const moment = require('moment');
const multiparty = require('multiparty');

const db = require('../../config/connection');
const middleware = require('../../config/authMiddleware');
const imageUplader = require('../../lib/imageUplader');
const entityHelper = require('../../lib/entityHelper');
const newPostPlaceSchema = require('./schema/postPlace');
const newEditPlaceSchema = require('./schema/editPlace');
const newPostNotificationSchema = require('./schema/postNotification');
const { ACCESS } = require('./constant');
const { GENDERS } = require('./../user/constant');
const { BOOKING_LIMIT_PERIODS } = require('./constant');

let User, Place, Offer, Counter, Booking, OfferPost, Interval, SamplePost;
db.getInstance(function (p_db) {
  User = p_db.collection('users');
  Place = p_db.collection('places');
  Offer = p_db.collection('offers');
  Counter = p_db.collection('counters');
  Booking = p_db.collection('bookings');
  OfferPost = p_db.collection('offerPosts');
  Interval = p_db.collection('bookingIntervals');
  SamplePost = p_db.collection('sampleposts');
});

module.exports = (
  app,
  placeRepository,
  placeTypeRepository,
  placeExtraRepository,
  placeTimeFramesRepository,
  cityRepository,
  placeUtil,
  validate,
) => {
  app.get('/api/place/:id/daysOffs', async (req, res) => {
    var id = parseInt(req.params.id);
      if(id){
        var place = await Place.findOne({ _id : id });
        if(place){
          res.status(200).json({ daysOff: place.daysOffs});
        }else{
          res.status(404).json({message : "place not found"});
        }
      }else{
        res.status(404).json({message : "invalid parameters"});
      }
  });

  /* migrate places allows field */
  /*
  app.get('/api/place/migrate', async (req, res) => {
    await Place.updateMany({ }, { $set: { allows: ['male', 'female']} });
    res.send('ok');
  });
  */

  /* migrate city field, set all to Milan */
  /*
  app.get('/api/place/migrate', async (req, res) => {
    await Place.updateMany({ }, { $set: { city: 'Milan' } });
    res.send('ok');
  });
  */

  app.post('/api/place/notification', middleware.isAuthorized, async (req, res) => {
    const validation = validate(req.body, newPostNotificationSchema());
    if (validation.error) {
      return res.status(400).json({ message: validation.error });
    }
    const { placeId, userId, date } = req.body;

    let formattedDate = moment(date);
    if (!formattedDate.isValid()) {
      return res.status(400).send({ message: `Keys in notifyUsersBooking must be a date! Got ${date}` });
    }
    formattedDate = formattedDate.format('DD-MM-YYYY');

    const place = await placeRepository.findOne(placeId);
    if (!place) {
      return res.status(404).json({ message: 'Place not found' });
    }

    let notifyUsersBooking = place.notifyUsersBooking;
    if (!notifyUsersBooking) {
      notifyUsersBooking = {};
    }
    if (!notifyUsersBooking[formattedDate]) {
      notifyUsersBooking[formattedDate] = [];
    }
    const user = await User.findOne({ _id: userId });
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    if (!user.devices || !user.devices.length) {
      return res.status(400).json({ message: 'User has no devices' });
    }
    for (const device of user.devices) {
      if (notifyUsersBooking[formattedDate]
        .every((presentDevice) => JSON.stringify(presentDevice) !== JSON.stringify(device))) {
          notifyUsersBooking[formattedDate].push(device);
        }
    }
    await placeRepository.findOneAndUpdate(placeId, { $set: { notifyUsersBooking } });

    return res.status(200).json({ message: 'ok' });
  });

  function timeFramesValid(validTimeFrames, timeFrames) {
    return Object.values(timeFrames)
      .every((daytimeFrames) => daytimeFrames.every(timeFrame => validTimeFrames.includes(timeFrame)));
  }

  // New Place
  app.post('/api/place', async (req, res) => {
    const validTypes = (await placeTypeRepository.find({}, { projection: { type: 1 } }))
      .map(placeType => placeType.type);
    const validExtras = (await placeExtraRepository.find({}, { projection: { name: 1 } }))
      .map(placeExtra => placeExtra.name);
    const validCities = (await cityRepository.find({}, { projection: { name: 1 } }))
      .map(city => city.name);
    const validation = validate(req.body, newPostPlaceSchema(validTypes, validExtras, validCities));
    if (validation.error) {
      return res.status(400).json({ message: validation.error });
    }

    const { timeFrames } = req.body;
    const validTimeFrames = (await placeTimeFramesRepository.find({ type: req.body.type }))
      .map(placeTimeFrame => placeTimeFrame.name);
    if (timeFrames && !timeFramesValid(validTimeFrames, timeFrames)) {
      return res.status(400)
        .json({ message: `Invalid time frames! Valid values for type ${req.body.type} are ${validTimeFrames || '[]'}` });
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
    };

    const seq = await Counter.findOneAndUpdate(
      { _id: 'placeid' },
      { $inc: { seq: 1 } },
      { new: true },
    );
    place._id = seq.value.seq;

    const placeInserted = await Place.insertOne(place);
    const id = await entityHelper.getNewId('intervalsid');
    const interval = {
      _id: id,
      place: seq.value.seq,
      intervals: [],
    };
    await Interval.insertOne(interval);
    return res.status(201).json(placeInserted.ops[0]);
  });

  // Edit Place
  app.put('/api/place/:id', async (req, res) => {
    const id = parseInt(req.params.id);
    const newPlace = req.body;
    const validTypes = (await placeTypeRepository.find({}, { projection: { type: 1 } }))
      .map(placeType => placeType.type);
    const validExtras = (await placeExtraRepository.find({}, { projection: { name: 1 } }))
      .map(placeExtra => placeExtra.name);
    const validCities = (await cityRepository.find({}, { projection: { name: 1 } }))
      .map(city => city.name);
    const validation = validate(newPlace, newEditPlaceSchema(validTypes, validExtras, validCities));
    if (validation.error) {
      return res.status(400).json({ message: validation.error });
    }

    Place.findOne({ _id: id }, async (err, place) => {
      err && console.log(err);
      if(!place) {
        res.json({ message: "No such place" });
      } else {
        if(!newPlace){
          res.status(500).json({message : "invalid body"})
        }else{

          if(newPlace.isActive !== place.isActive) place.isActive = newPlace.isActive;
          if(newPlace.phone !== place.phone && newPlace.phone) place.phone = newPlace.phone;
          if(newPlace.instapage !== place.instapage && newPlace.instapage) place.instapage = newPlace.instapage;
          if(newPlace.name !== place.name && newPlace.name) place.name = newPlace.name;
          if(newPlace.type !== place.type && newPlace.type) place.type = newPlace.type;
          if(newPlace.address !== place.address && newPlace.address) place.address = newPlace.address;
          if(newPlace.photos !== place.photos && newPlace.photos) place.photos = newPlace.photos;
          if(newPlace.description !== place.description && newPlace.description) place.description = newPlace.description;
          if(newPlace.slots !== place.slots && newPlace.slots) place.slots = newPlace.slots;
          if(newPlace.level !== place.level && newPlace.level) place.level = newPlace.level;
          if(newPlace.socials) {
            if(newPlace.socials.facebook !== place.socials.facebook && newPlace.socials.facebook) place.socials.facebook = newPlace.socials.facebook;
            if(newPlace.socials.google !== place.socials.google && newPlace.socials.google) place.socials.google = newPlace.socials.google;
            if(newPlace.socials.tripAdvisor !== place.socials.tripAdvisor && newPlace.socials.tripAdvisor) place.socials.tripAdvisor = newPlace.socials.tripAdvisor;
            if(newPlace.socials.yelp !== place.socials.yelp && newPlace.socials.yelp) place.socials.yelp = newPlace.socials.yelp;
            if(newPlace.socials.instagram !== place.socials.instagram && newPlace.socials.instagram) place.socials.instagram = newPlace.socials.instagram;
          }
          if(newPlace.schedule) {
            if(newPlace.schedule.monday !== place.schedule.monday && newPlace.schedule.monday) place.schedule.monday = newPlace.schedule.monday;
            if(newPlace.schedule.tuesday !== place.schedule.tuesday && newPlace.schedule.tuesday) place.schedule.tuesday = newPlace.schedule.tuesday;
            if(newPlace.schedule.wednesday !== place.schedule.wednesday && newPlace.schedule.wednesday) place.schedule.wednesday = newPlace.schedule.wednesday;
            if(newPlace.schedule.thursday !== place.schedule.thursday && newPlace.schedule.thursday) place.schedule.thursday = newPlace.schedule.thursday;
            if(newPlace.schedule.friday !== place.schedule.friday && newPlace.schedule.friday) place.schedule.friday = newPlace.schedule.friday;
            if(newPlace.schedule.saturday !== place.schedule.saturday && newPlace.schedule.saturday) place.schedule.saturday = newPlace.schedule.saturday;
            if(newPlace.schedule.sunday !== place.schedule.sunday && newPlace.schedule.sunday) place.schedule.sunday = newPlace.schedule.sunday;
          }
          if(newPlace.location) {
            if(newPlace.location.coordinates[0] !== place.location.coordinates[0] && newPlace.location.coordinates[0]) place.location.coordinates[0] = parseFloat(newPlace.location.coordinates[0]);
            if(newPlace.location.coordinates[1] !== place.location.coordinates[1] && newPlace.location.coordinates[1]) place.location.coordinates[1] = parseFloat(newPlace.location.coordinates[1]);
          }
          
          if(newPlace.photo) place.photos.push(newPlace.photo);
          if(newPlace.photos) place.photos.concat(newPlace.photos);
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

          Place.replaceOne({_id: id }, place, function () {
            res.json({ message: "Place updated" });
          });
        }
      }
    });
  });

  // Find all the places near the specified coordinate
  app.get('/api/place/near', (req, res) => {
    const lat = parseFloat(req.query.lat);
    const long = parseFloat(req.query.long);
    const radius = req.query.radius;

    Place.find({ location: { $nearSphere: { $geometry: { type: "Point", coordinates: [lat, long] },
          $maxDistance: radius * 1000 }}}, { projection: { client: 0 }}).toArray(async function (err, places) {
      if(err) console.log(err);
      if(!places){
        res.json({ message: "Something bad happened" });
      } else {
        const extendedData = await getMoreData(places);
        res.json(extendedData);
      }
    });
  });
 
  // Get concrete Place and give it Offers, Bookings and Intervals from another entities
  app.get('/api/place/:id', function (req, res) {
    var id = parseInt(req.params.id);
    Place.findOne({ _id: id, isActive : true }, { projection: { client: 0 }}, async function (err, place) {
      if(!place){
        res.json({ message: "No such place" });
      } else {
        var interval = await Interval.findOne({ place: place._id });
        var books = await Booking.find({ place: place._id, closed: false }).toArray();
        var offers = await Offer.find({ place: place._id, closed: false }).sort({ price: 1 }).toArray();

        place.minOffer = null;
        if(offers.length !== 0) {
          place.minOffer = offers[0]['price'];
        }

        if(interval) place.intervals = interval.intervals;
        place.bookings = books;
        place.offers = offers;
        res.json(place);
      }
    });
  });
  app.post('/api/place/:id/notificationRecivers', async (req, res) => {
    var id = parseInt(req.params.id);
    if(id){
      Place.findOneAndUpdate({ _id : id },
        { $set: { notificationRecivers : req.body.recivers } },
        { new: true })
        .then((place) => {
          res.status(200).json(place.notificationRecivers);
        })
        .catch((err) => {

        });
    }else{
      res.status(404).json({message: 'place not found' });
    }
  });
  app.get('/api/place/:id/notificationRecivers', async (req, res) => {
    var id = parseInt(req.params.id);
    if(id){
      Place.findOne({ _id : id })
        .then((place) => {
          res.status(200).json(place.notificationRecivers);
        })
        .catch((err) => {

        });
    }else{
      res.status(404).json({message: 'place not found' });
    }
  });
  // Get all Places with limit and offset
  app.get('/api/place/:limit/:offset', function (req, res) {
    var limit = parseInt(req.params.limit);
    var offset = parseInt(req.params.offset);
    Place.find({}, { projection: { client: 0 }}).skip( ( offset - 1 ) * limit  ).limit( limit ).toArray( async function (err, places) {
      const extendedData = await getMoreData(places);
      res.json(extendedData);
    });
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
  
  app.get('/api/v2/place', middleware.isAuthorized, async (req, res) => {
    const { id, typology, extra, city, timeframe, date } = req.query;
    if (date && !moment(date, 'YYYY-MM-DD').isValid()) {
      return res.status(400).json({ message: 'Incorrect date, use YYYY-MM-DD format' });
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
          icons,
        }
      })
      .sort((a, b) => b.freeSpots - a.freeSpots));
    res.status(200).json(mappedPlaces);
  });

  // Get all Places
  app.get('/api/place', middleware.isAuthorized, async (req, res) => {
    const { id, typology, extra, city, timeframe, date } = req.query;
    const query = await getPlaceQuery(id, typology, extra, timeframe, date, city);

    try {
      const places = await placeRepository.findAllWhereExcludeFields(query, ['client']);
      const placesJoined = await getMoreData(places);
  
      return res.status(200).json(placesJoined);
    } catch (err) {
      return res.status(500).json({ message: 'Internal server error' });
    }
  });
  // Get all Places
  app.get('/api/admin/place', function (req, res) {
    Place.find({ }, { projection: { client: 0 }}).toArray( async function (err, places) {
      const extraData = await getMoreData(places);
      res.json(extraData);
    });
  });

  // Delete the place
  app.delete('/api/place/:id', function (req, res) {
    var id = parseInt(req.params.id)
    Place.deleteOne({ _id: id }, function (err, deleted) {
      if(deleted.deletedCount !== 1){
        res.json({ message: "Wrong id" });
      } else {
        Offer.updateMany({ place: id }, { $set: { place: null }});
        Booking.updateMany({ place: id }, { $set: { place: null }});
        OfferPost.updateMany({ place: id }, { $set: { place: null }});
        SamplePost.deleteMany({ place: id });
        res.json({ message: "Deleted" });
      }
    });
  });
  app.delete('/api/place/:id/images', async (req,res) => {
    var id = parseInt(req.params.id);
    var imageId = req.body.imageId;
    if(id){
      var place = await Place.findOne({ _id : id });
      if(place){
        var image = place.images.find( x=>x.id == imageId);
        if(image){
          await imageUplader.deleteImage(image.cloudinaryId)
          .then(() => {
            Place.findOneAndUpdate({_id: id}, { $pull: { 'images' : { 'id': image.id } }})
              .then(async () => {
                if(place.mainImage == image.url){
                  await Place.findOneAndUpdate({_id: id }, {$set: { mainImage:  null } })
                }
                res.status(200).json({message: 'ok'});
              })
              .catch((err) => {
                console.log(err);
              })
          })
          .catch((err) => {
            res.status(400).json({message : err });
        });
      }else{
        res.status(404).json({message : "Image is for the wrong place"});
      }
      }else{
        res.status(404).json({message : "Place not found"});
      }
    }else{
      res.status(404).json({message : "invalid parameters"});
    }
    
  });
  app.post('/api/place/:id/images', async (req,res) => {
    var id = parseInt(req.params.id);
    if(id){
      var place = await Place.findOne({ _id : id });
      if(place){
      var form = new multiparty.Form();
      form.parse(req, async function (err, fields, files) {
        if(files){
          files = files.images;
          for (file of files) {
            await imageUplader.uploadImage(file.path, 'places', place._id)
              .then(async (newImage) =>{
                await Place.findOneAndUpdate({ _id: id }, { $push: { images: newImage } })
              })
              .catch((err) => {
                console.log(err);
              });
          }
          res.status(200).json({message: "ok"});
        }else{
          res.status(400).json({message : "no files added"});
        }
      });
    }else{
      res.status(404).json({message : "Place not found" });
    }
    }else{
    res.status(404).json({message : "invalid parameters"});
      }
  });
  app.post('/api/place/:id/daysOffs', async (req, res) => {
    var id = parseInt(req.params.id);
    let daysOffs = req.body.daysOffs;
    if(daysOffs && validateDaysOff(daysOffs)){
      if(id){
        var place = await Place.findOne({ _id : id });
        if(place){
          place.daysOffs = daysOffs;
          await Place.replaceOne({_id: place._id}, place);
          res.status(200).json({ message: 'days off changed'});
        }else{
          res.status(404).json({message : "place not found"});
        }
      }else{
        res.status(404).json({message : "invalid parameters"});
      }
    }else{
      res.status(404).json({message : "collection not valid"});
    }
  });
 
  app.put('/api/place/:id/images/:imageId/main', async (req,res) => {
    var id = parseInt(req.params.id);
    var imageId = req.params.imageId;
    if(id && imageId){
      var place = await Place.findOne({ _id : id });
      if(place && place.images && place.images.find( x=>x.id == imageId)){
        await Place.findOneAndUpdate({ _id : id }, {$set : { 'images.$[].isMainImage': false } } );
        var image = place.images.find( x=>x.id == imageId);
        await Place.findOneAndUpdate({ _id : id }, 
          { $set : { mainImage : image.url, 'images.$[t].isMainImage' : true }},
          { arrayFilters: [ {"t.id": imageId  } ] }
          )
          res.status(200).json({message: "ok"});
      }else{
        res.status(404).json({message : "place not found"});
      }
    }else{
      res.status(404).json({message : "invalid parameters"});
    }
  });
  app.get('/api/place/:id/booking/:bookingId/offers', async (req, res) => {
    var placeId = parseInt(req.params.id);
    var bookingId = parseInt(req.params.bookingId);

    if(placeId && bookingId){
      let place = await Place.findOne({ _id: placeId});
      let booking = await Booking.findOne({ _id : bookingId });
      let interval = await Interval.findOne({place : placeId });
      if(place && booking && interval){
        let slot = interval.intervals.find(x =>
          {
            if(booking.day){
              return x.day == booking.day && x.start == booking.startTime && x.end == booking.endTime;
            }else{
              return x.start == booking.startTime && x.end == booking.endTime;
            }
          });
          if(slot && slot.offers && Array.isArray(slot.offers)){
            Offer.find({place: placeId}).toArray(async (err, offers)  => {
              offers = offers.map(x=>{
                x.isAvailable = slot.offers.indexOf(x._id) > -1;
                return x;
              })
              res.status(200).json(offers);
            });
          }else{  
            Offer.find({place: placeId}).toArray(async (err, offers)  => {
              offers = offers.map(x=>{
                x.isAvailable = true;
                return x;
              })
              res.status(200).json(offers);
            });
          }
      }else{
        res.status(404).json({message : "place, booking or interval not found"});
      }
    }else{
      res.status(404).json({message : "invalid parameters"});
    }
  });
  
};

validateDaysOff = (daysOffs) => {
  let isValid = true;
  let requiredProperties = ['date', 'isWholeDay', 'intervals']
  daysOffs.forEach(dayOff => {
    let objectKeys = Object.keys(dayOff);
    requiredProperties.forEach(key => {
      let foundKey =  objectKeys.find(x=> x == key);
      if(foundKey){
        if(foundKey == 'date'){
          if(moment(dayOff.date).isValid()){
            dayOff.date = moment(dayOff.date).format('DD-MM-YYYY');
          }else{
            isValid = false;
          }
        }
        if(foundKey == 'isWholeDay' && typeof dayOff.isWholeDay !== "boolean"){
            isValid = false;
        }
        if(foundKey == 'intervals'){
          dayOff['intervals'].forEach(interval => {
            let intervalObjectKeys = Object.keys(interval);
            if(intervalObjectKeys.find(y => y == 'start') && intervalObjectKeys.find(y => y == 'end') 
              && moment(`2019-01-01 ${interval.start.replace('.',':')}`).isValid() 
              && moment(`2019-01-01 ${interval.end.replace('.',':')}`).isValid()
            ){
              interval.start = moment(`2019-01-01 ${interval.start.replace('.',':')}`).format('HH.mm');
              interval.end = moment(`2019-01-01 ${interval.end.replace('.',':')}`).format('HH.mm');
            }else{
              isValid = false;
            }
          });
        }
      }else{
        isValid = false;
      }
    });
  });
  return isValid;
}
async function getMoreData(places) {
  var full = await Promise.all(places.map(async function (place) {
    var interval = await Interval.findOne({ place: place._id });
    var books = await Booking.find({ place: place._id, closed: false }).toArray();
    var offers = await Offer.find({ place: place._id, closed: false }).toArray();

    place.minOffer = null;
    if(offers.length !== 0) {
      place.minOffer = offers[0]['price'];
    }

    if(interval) place.intervals = interval.intervals;
    place.bookings = books || [];
    place.offers = offers || [];
    return place;
  }));
  return full;
}
