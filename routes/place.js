var db = require('../config/connection');
var middleware = require('../config/authMiddleware');
var moment = require('moment');

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

module.exports = function (app) {

  // New Place
  app.post('/api/place', function (req, res) {

    var place = {};
    place.name = req.body.name;
    place.type = req.body.type;
    place.address = req.body.address;
    place.photos = req.body.photos;
    place.location = {};
    place.location.type = "Point";
    place.location.coordinates = [parseFloat(req.body.coordinates[0]), parseFloat(req.body.coordinates[1])];
    place.socials = {};
    if (req.body.socials) {
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
    // Make all fields required
    if (!place.name || !place.type || !place.address || !place.photos || !place.location.coordinates ||
      !place.level || !place.description || !place.schedule || !place.slots) {
      res.json({ message: "Not all fields are provided" });
    } else {
      Counter.findOneAndUpdate(
        { _id: "placeid" },
        { $inc: { seq: 1 } },
        { new: true },
        function (err, seq) {
          if (err) console.log(err);
          place._id = seq.value.seq;

          Place.insertOne(place, function () {
            res.json({ message: "The place is added" });
          });
        }
      );
    }
  });

  // Edit Place
  app.put('/api/place/:id', function (req, res) {
    var id = parseInt(req.params.id);
    var newPlace = req.body.place;
    var intervals=req.body.intervals

    //fetch time inteerval with calling method
    const intervaldata = getIntervalData(id, res);


    Place.findOne({ _id: id }, function (err, place) {
      intervaldata.then(function (value) {
       
        });
      err && console.log(err);
      if (!place) {
        res.json({ message: "No such place" });
      } else {

        if (newPlace.name !== place.name && newPlace.name) place.name = newPlace.name;
        if (newPlace.type !== place.type && newPlace.type) place.type = newPlace.type;
        if (newPlace.address !== place.address && newPlace.address) place.address = newPlace.address;
        if (newPlace.photos !== place.photos && newPlace.photos) place.photos = newPlace.photos;
        if (newPlace.description !== place.description && newPlace.description) place.description = newPlace.description;
        if (newPlace.slots !== place.slots && newPlace.slots) place.slots = parseInt(newPlace.slots);
        if (newPlace.level !== place.level && newPlace.level) place.level = parseInt(newPlace.level);
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

        Place.replaceOne({ _id: id }, place, function () {
          Interval.updateMany({place: id}, {'$set': {
            'intervals': intervals
        }});
          res.json({ message: "Place updated" });
        });
      }
    });
  });

  // Find all the places near the specified coordinate
  app.get('/api/place/near', function (req, res) {

    var lat = parseFloat(req.query.lat);
    var long = parseFloat(req.query.long);
    var radius = req.query.radius;

    Place.find({
      location: {
        $nearSphere: {
          $geometry: { type: "Point", coordinates: [lat, long] },
          $maxDistance: radius * 1000
        }
      }
    }, { projection: { client: 0 } }).toArray(async function (err, places) {
      if (err) console.log(err);
      if (!places) {
        res.json({ message: "Something bad happened" });
      } else {
        getMoreData(places, res);
      }
    });
  });

  // Get concrete Place and give it Offers, Bookings and Intervals from another entities
  app.get('/api/place/:id', function (req, res) {
    var id = parseInt(req.params.id);
    Place.findOne({ _id: id }, { projection: { client: 0 } }, async function (err, place) {
      if (!place) {
        res.json({ message: "No such place" });
      } else {
        var interval = await Interval.findOne({ place: place._id });
        var books = await Booking.find({ place: place._id, closed: false }).toArray();
        var offers = await Offer.find({ place: place._id, closed: false }).sort({ price: 1 }).toArray();

        place.minOffer = null;
        if (offers.length !== 0) {
          place.minOffer = offers[0]['price'];
        }

        if (interval) place.intervals = interval.intervals;
        place.bookings = books;
        place.offers = offers;
        res.json(place);
      }
    });
  });

  // Get all Places with limit and offset
  app.get('/api/place/:limit/:offset', function (req, res) {
    var limit = parseInt(req.params.limit);
    var offset = parseInt(req.params.offset);
    Place.find({}, { projection: { client: 0 } }).skip((offset - 1) * limit).limit(limit).toArray(async function (err, places) {
      getMoreData(places, res);
    });
  });

  // Get all Places
  app.get('/api/place', function (req, res) {
    Place.find({}, { projection: { client: 0 } }).toArray(async function (err, places) {
      console.log(":places",places)
      getMoreData(places, res);
    });
  });

  // Delete the place
  app.delete('/api/place/:id', function (req, res) {
    var id = parseInt(req.params.id)
    Place.deleteOne({ _id: id }, function (err, deleted) {
      if (deleted.deletedCount !== 1) {
        res.json({ message: "Wrong id" });
      } else {
        Offer.updateMany({ place: id }, { $set: { place: null } });
        Booking.updateMany({ place: id }, { $set: { place: null } });
        OfferPost.updateMany({ place: id }, { $set: { place: null } });
        SamplePost.deleteMany({ place: id });
        res.json({ message: "Deleted" });
      }
    });
  });
};

async function getMoreData(places, res) {
  // console.log(places)
  var full = await Promise.all(places.map(async function (place) {
    var interval = await Interval.findOne({ place: place._id });
    var books = await Booking.find({ place: place._id, closed: false }).toArray();
    var offers = await Offer.find({ place: place._id, closed: false }).toArray();
      console.log("hello",interval)
    place.minOffer = null;
    if (offers.length !== 0) {
      place.minOffer = offers[0]['price'];
    }
    if (interval) {
      // for (var i = 0; i < interval.intervals.length; i++) {
      //   interval.intervals[i].slot = place.slots;
      // }
      place.intervals = interval.intervals;

    }
    place.bookings = books || [];
    place.offers = offers || [];
    return place;
  }));
  res.json(full);
}
async function getIntervalData(place, res) {

  var interval = await Interval.findOne({ place: place });
  console.log(interval)


  if (interval) {
    // for (var i = 0; i < interval.intervals.length; i++) {
    //   interval.intervals[i].slot = place.slots;
    // }
    place.intervals = interval.intervals;

  }

  return interval;
  res.json(full);
}
