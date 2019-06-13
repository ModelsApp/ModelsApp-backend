var db = require('../config/connection');
var middleware = require('../config/authMiddleware');
var moment = require('moment');
var imageUplader = require('../lib/imageUplader');
var multiparty = require('multiparty');
var entityHelper = require('../lib/entityHelper');

var User, Place, Offer, Counter, Booking, OfferPost, Interval, SamplePost;
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

module.exports = function(app) {
  
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
  // New Place
  app.post('/api/place', middleware.isAdmin, function (req, res) {

    var place = {};
    place.name = req.body.name;
    place.type = req.body.type;
    place.address = req.body.address;
    place.photos = req.body.photos;
    place.location = {};
    place.location.type = "Point";
    place.location.coordinates = [parseFloat(req.body.coordinates[0]), parseFloat(req.body.coordinates[1])];
    place.socials = {};
    if(req.body.socials) {
      place.socials.facebook = req.body.socials.facebook || '';
      place.socials.tripAdvisor = req.body.socials.tripAdvisor || '';
      place.socials.google = req.body.socials.google || '';
      place.socials.yelp = req.body.socials.yelp || '';
      place.socials.instagram = req.body.socials.instagram || '';
    }
    place.level = parseInt(req.body.level);
    place.description = req.body.description;
    place.schedule = req.body.schedule;
    place.slots = parseInt(req.body.slots);
    place.creationDate = moment().format('DD-MM-YYYY');
    place.credits = 0;
    place.bookings = [];
    place.offers = [];
    place.posts = [];
    place.notificationRecivers = [];
    place.images = [];
    place.mainImage = null;
    place.instapage = null;
    place.daysOffs = [];
    place.isActive = true;

    // Make all fields required
    if(!place.name || !place.type || !place.address || !place.photos || !place.location.coordinates ||
      !place.level || !place.description || !place.schedule || !place.slots){
      res.json({ message: "Not all fields are provided" });
    } else {
      Counter.findOneAndUpdate(
        { _id: "placeid" },
        { $inc: { seq: 1 } },
        {new: true},
        function(err, seq) {
          if(err) console.log(err);
          place._id = seq.value.seq;

          Place.insertOne( place, function() {
            entityHelper.getNewId('intervalsid').then((id) => {
              let interval = {
                _id: id,
                place: seq.value.seq,
                intervals: []
              }
              Interval.insertOne(interval, function(){
                res.json({ message: "The place is added", _id: seq.value.seq });
              })
            })
          });
        }
      );
    }
  });

  // Edit Place
  app.put('/api/place/:id', function (req, res) {
    var id = parseInt(req.params.id);
    var newPlace = req.body.place;

    Place.findOne({_id: id }, function (err, place) {
      err && console.log(err);
      if(!place) {
        res.json({ message: "No such place" });
      } else {
        if(!newPlace){
          res.status(500).json({message : "invalid body"})
        }else{

          if(newPlace.isActive !== place.isActive && newPlace.isActive) place.isActive = newPlace.isActive;
          if(newPlace.tags !== place.tags && newPlace.tags) place.tags = newPlace.tags;
          if(newPlace.phone !== place.phone && newPlace.phone) place.phone = newPlace.phone;
          if(newPlace.instapage !== place.instapage && newPlace.instapage) place.instapage = newPlace.instapage;
          if(newPlace.name !== place.name && newPlace.name) place.name = newPlace.name;
          if(newPlace.type !== place.type && newPlace.type) place.type = newPlace.type;
          if(newPlace.address !== place.address && newPlace.address) place.address = newPlace.address;
          if(newPlace.photos !== place.photos && newPlace.photos) place.photos = newPlace.photos;
          if(newPlace.description !== place.description && newPlace.description) place.description = newPlace.description;
          if(newPlace.slots !== place.slots && newPlace.slots) place.slots = parseInt(newPlace.slots);
          if(newPlace.level !== place.level && newPlace.level) place.level = parseInt(newPlace.level);
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

          Place.replaceOne({_id: id }, place, function () {
            res.json({ message: "Place updated" });
          });
        }
      }
    });
  });

  // Find all the places near the specified coordinate
  app.get('/api/place/near', function (req, res) {

    var lat = parseFloat(req.query.lat);
    var long = parseFloat(req.query.long);
    var radius = req.query.radius;

    Place.find({ location: { $nearSphere: { $geometry: { type: "Point", coordinates: [lat, long] },
          $maxDistance: radius * 1000 }}}, { projection: { client: 0 }}).toArray(async function (err, places) {
      if(err) console.log(err);
      if(!places){
        res.json({ message: "Something bad happened" });
      } else {
        getMoreData(places, res);
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
  })
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
      getMoreData(places, res);
    });
  });
  
  // Get all Places
  app.get('/api/place', function (req, res) {
    Place.find({ isActive : true }, { projection: { client: 0 }}).toArray( async function (err, places) {
      getMoreData(places, res);
    });
  });
  // Get all Places
  app.get('/api/admin/place', function (req, res) {
    Place.find({ }, { projection: { client: 0 }}).toArray( async function (err, places) {
      getMoreData(places, res);
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
async function getMoreData(places, res) {
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
  res.json(full);
}
