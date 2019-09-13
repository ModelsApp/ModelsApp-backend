const middleware = require('../config/authMiddleware');
const moment = require('moment');

module.exports = (app, User, Place, Offer, Counter, Booking, OfferPost, Interval, SamplePost) => {

  // Edit Place
  app.put('/api/client', middleware.isClient, function (req, res) {
    var id = req.user._id;
    var newPlace = req.body.place;

    Place.findOne({_id: id }, function (err, place) {
      err && console.log(err);
      if(!place) {
        res.json({ message: "No such place" });
      } else {

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
    });
  });
  
  app.post('/api/client/offer', middleware.isClient, function (req, res) {
    var id = req.user._id;
    res.redirect(307, '/api/place/' + id + '/offer');
  });

  app.post('/api/client/sample', middleware.isClient, function (req, res) {
    var id = req.user._id;
    res.redirect(307, '/api/place/' + id + '/post/sample');
  });

  app.get('/api/client', middleware.isClient, function (req, res) {
    var id = req.user._id;
    Place.findOne({ _id: id }, { projection: { 'client.password': 0 }}, async function (err, place) {
      place.intervals = await Interval.findOne({ _id: place.intervals });
      res.json(place);
    });
  });

  app.get('/api/client/offers', middleware.isClient, function (req, res) {
    var id = req.user._id;
    Offer.find({ place: id }).toArray(function (err, offers) {
      res.json(offers);
    });
  });

  app.get('/api/client/samples', middleware.isClient, function (req, res) {
    var id = req.user._id;

    SamplePost.findOne({}, function (err, checkSample) {
      if(checkSample.updatedDate !== moment().format('DD-MM-YYYY')) {
        SamplePost.updateMany({}, { $set: { updatedDate: moment().format('DD-MM-YYYY'), users: [] }});
      }
    });

    SamplePost.find({ place: id }).toArray(function (err, samples) {
      res.json(samples);
    });
  });

  app.get('/api/client/bookings', middleware.isClient, function (req, res) {
    var id = req.user._id;
    res.redirect('/api/place/' + id + '/book');
  });

  app.delete('/api/client', middleware.isClient, function (req, res) {
    var id = req.user._id;
    Place.deleteOne({ _id: id });
    Offer.updateMany({ place: id }, { $set: { place: null }});
    Booking.updateMany({ place: id }, { $set: { place: null }});
    OfferPost.updateMany({ place: id }, { $set: { place: null }});
    SamplePost.deleteMany({ place: id });
    res.json({ message: "Deleted" });
  });
};
