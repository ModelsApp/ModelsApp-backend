const _ = require('lodash');
const moment = require('moment');
const crypto = require('crypto');

const db = require('../config/connection');
const sendGrid = require('../lib/sendGrid');
const entityHelper = require('../lib/entityHelper');
const { SUBSCRIPTION, SUBSCRIPTION_BOOKING_LIMITS } = require('./../config/constant');
const { ACCESS, BOOKING_LIMIT_PERIODS } = require('./place/constant');

const calculateOfferPoints = require('./actionPoints/calculator/offer');

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

module.exports = function(app) {

  /* migrate creationDate on Booking locally */
  /*
  app.get('/api/booking/migrate', async (req, res) => {
    const a = await Booking.find({}).toArray();

    const ps = await Promise.all(a.map(async (el) => {
      const parts = el.creationDate.split("-");
      el.creationDate = moment(new Date(parts[2], parts[1] - 1, parts[0])).add({days:1}).subtract({hours:22}).toISOString();
      await Booking.replaceOne({ _id: el._id }, el);
    }));

    res.send(ps);
  });
  */

  /* migrate users subscriptions to unlimited */
  /*
  app.get('/api/booking/user/migrate', async (req, res) => {
    const users = await User.find({}).toArray();

    await Promise.all(users.map(async (user) => {
      user.subscriptionPlan = { subscription: SUBSCRIPTION.unlimited };
      const newUser = _.omit(user, ['plan']);
      await User.replaceOne({ _id: user._id }, newUser);
    }));

    res.send('ok');
  });
  */

  /* migrate places access to basic */
  /*
  app.get('/api/booking/place/migrate', async (req, res) => {
    const places = await Place.find({}).toArray();

    await Promise.all(places.map(async (place) => {
      place.access = ACCESS.basic;
      await Place.replaceOne({ _id: place._id }, place);
    }));

    res.send('ok');
  });
  */

  app.get('/api/place/:id/book/slots', async (req, res) => {
    const id = parseInt(req.params.id);
    const reqDate = req.body.date || req.query.date;
    const day = moment(reqDate);
    const date = moment(reqDate).format('DD-MM-YYYY');
    if(!date) {
      res.json({ message: "Please, provide the date" });
    } else {
      if (day.isValid()) {
        try {
          const place = await (() => new Promise(async (resolve, reject) => {
            Place.findOne({ _id: id }, (err, place) => {
              if (err) {
                return reject(err);
              }
              if (!place) {
                return reject({ message: "No such place" });
              }
              return resolve(place);
            });
          }))();
          const singlePlaceSlots = await getSinglePlaceSlots(place, day, date);
          if (!singlePlaceSlots) {
            return res.json({ message: "This place has no booking intervals" });
          }
          return res.json(singlePlaceSlots);
        } catch (error) {
          console.error(error);
          res.json({ message: "Something went wrong"});
        }
      } else {
        res.json({message: "Invalid date format, accepted format is YYYY-DD-MM"});
      }
    }
  });

  app.post('/api/place/book/slots', async (req, res) => {
    const { date: reqDate } = req.body;
    if (!reqDate) {
      return res.json({ message: "Please, provide the date" });
    }
    let day, date;
    try {
      day = moment(reqDate);
      date = moment(reqDate).format('DD-MM-YYYY');
    } catch (error) {
      return res.json({ message: "Please, provide correct date" });
    }
    const placesSlots = await (() => new Promise((resolve, reject) => {
      Place.find({ isActive : true }).toArray(async (err, places) => {
        if (err) {
          return reject(err);
        }
        const placesSlots = await Promise.all(places.map(async place => {
          let freeSpots = await getSinglePlaceSlots(place, day, date);
          if (freeSpots && freeSpots.length) {
            freeSpots = freeSpots.reduce((acc, slot) => acc + slot.free, 0);
          } else {
            freeSpots = 0;
          }
          return {
            name: place.name,
            address: place.address,
            location: place.location,
            type: place.type,
            mainImage: place.mainImage,
            freeSpots,
          }
        }));
        return resolve(placesSlots);
      });
    }))();

    return res.json(placesSlots.sort((a, b) => b.freeSpots - a.freeSpots));
  });

  getSinglePlaceSlots = (place, day, date) => {
    const { _id } = place;
    return new Promise((resolve) => {
      Interval.findOne({ place: _id }, async (err, intervals) => {
        if (err || !intervals) {
          return resolve(null);
        }
        let dayOff = null;
        if (place.daysOffs) dayOff = place.daysOffs.find(x => x.date == date);

        const newArr = await Promise.all(intervals.intervals.map(async (interval) => {
          if (interval.day == day.format('dddd')){
            if (dayOff && (dayOff.isWholeDay || dayOff.intervals.filter(x=>x.start == interval.start && x.end == interval.end).length > 0)) {
              interval.free = 0;
            } else {
              const taken = await Booking.countDocuments({ place: _id, date: date, startTime: interval.start, day: interval.day });
              interval.free = interval.slots - taken;
            }
            interval._id = crypto.createHash('sha1').update(`${interval.start}${interval.end}${interval.day}`).digest("hex");
            interval.timestamp = moment(`2019-01-01 ${interval.start.replace('.',':')}`).format("X");
            return interval;
          }
        }));
        return resolve(newArr
          .filter(x => x != null)
          .sort((a,b) => a.timestamp > b.timestamp));
      });
    });
  }

  function generateOfferPrices(offers, userLevel) {
    return offers.map(offer => ({ ...offer, price: calculateOfferPoints(userLevel, offer.level) }));
  }

  // Get the specific Booking
  app.get('/api/place/book/:id', (req, res) => {
    var id = parseInt(req.params.id);
    Booking.findOne({_id: id}, async function (err, book) {
      if (!book) {
        res.json({message: "No such booking"});
      } else {
        let user;
        try {
          user = await User.findOne({ _id: book.user });
        } catch (error) {
          return res.status(500).json({ message: 'Internal server error' });
        }
        if (!user) {
          return res.status(404).json({ message: 'User not found' });
        }
        // Check if the booking is older than 24 hours
        var date = moment(book.date + ' ' + book.endTime, 'DD-MM-YYYY HH.mm');
        var tommorow = moment(date.add('1', 'days').format('DD-MM-YYYY'), 'DD-MM-YYYY');
        var diff = tommorow.diff(moment(), 'days');
        if (diff < 0 && !book.closed) {
          Booking.findOneAndUpdate({_id: book._id}, {$set: {closed: true}});
          book.closed = true;
        }

        book.place = await Place.findOne({_id: book.place}, {
          projection: { name: 1, type: 1, description: 1, socials: 1, location: 1, address: 1, photos: 1 }
        });

        book.place.photos = book.place.photos[0];
        if (book.offers) {
          book.offers = await Offer.find({_id: {$in: book.offers}}).toArray();
          book.offers = generateOfferPrices(book.offers, user.level);
          res.json({place: book});
        } else {
          res.json({place: book});
        }
      }
    });
  });

  //Get all the booking belonging to specified place
  app.get('/api/place/:id/book', function (req, res) {
    var id = parseInt(req.params.id);
    Booking.find({place: id}).toArray(async function (err, books) {
      var full = await Promise.all(books.map(async function (book) {
        var place = await Place.findOne({_id: book.place}, {
          projection: { name: 1, type: 1, description: 1, socials: 1, location: 1, address: 1, photos: 1, mainImage: 1 }
        });
        if (!place) {
          book.place = {};
        } else {
          place.photo = place.mainImage;
          delete place.photos;
          book.place = place;
        }

        var date = moment(book.date + ' ' + book.endTime, 'DD-MM-YYYY HH.mm');
        var tommorow = moment(date.add('1', 'days').format('DD-MM-YYYY'), 'DD-MM-YYYY');
        var diff = tommorow.diff(moment(), 'days');
        if (diff < 0 && !book.closed) {
          Booking.findOneAndUpdate({_id: book._id}, {$set: {closed: true}});
          book.closed = true;
        }

        if (diff < 0) {
          return;
        }

        return book;
      }));
      var newFull = full.filter(function (elem) {
        return elem !== undefined;
      });

      res.json(newFull);
    });
  });

  // Deletes the booking document and all links to it
  app.delete('/api/place/book/:id', function (req, res) {
    var id = parseInt(req.params.id);
    Booking.findOne({_id: id}, function (err, book) {
      if (!book) {
        res.json({message: "No such booking"});
      } else if (book.closed) {
        res.status(500);
        res.json({message: "The booking is closed and could not be deleted"});
      } else {
        var timeDiff = moment(book.date + ' ' + book.startTime, 'DD-MM-YYYY HH.mm').diff(moment(), 'minutes');

        if (timeDiff < 60) {
          res.status(500);
          res.json({message: "Could not be deleted. Less than one hours left"});
        } else {
          Place.findOneAndUpdate({_id: parseInt(book.place)}, {$pull: {bookings: id}}, function (err, updated) {
            if (!updated.value) {
              res.json({message: "Could not be deleted"});
            } else {
              User.findOneAndUpdate({_id: parseInt(book.user)}, {
                $pull: {bookings: id},
                $inc: {credits: book.payed}
              }, function (err, updated) {
                if (!updated.value) {
                  res.json({message: "Could not be deleted"});
                } else {
                  Booking.deleteOne({_id: id}, function (err, deleted) {
                    if (deleted.deletedCount === 1) {
                      res.json({message: "Deleted"});
                    } else {
                      res.status(500);
                      res.json({message: "Not deleted"});
                    }
                  });
                }
              });
            }
          });
        }
      }
    });
  });

  // Add offer to the booking
  app.put('/api/place/book/:id/offer', function (req, res) {
    var id = parseInt(req.params.id);
    var offer = parseInt(req.body.offerID);

    if (!offer) {
      res.json({message: "Provide an offer ID"});
    } else {
      Booking.findOneAndUpdate({_id: id}, {$push: {offers: offer}}, function (err, book) {
        if (!book.value) {
          res.json({message: "No such booking"});
        } else {
          res.json({message: "Added"});
        }
      });
    }
  });

  // Close the Booooooking
  app.put('/api/place/book/:id', function (req, res) {
    var id = parseInt(req.params.id);
    Booking.findOneAndUpdate({_id: id}, {$set: {closed: true}}, function (err, book) {
      if (!book.value) {
        res.json({message: "No such booking"});
      } else {
        res.json({message: "Booking is closed"});
      }
    })
  });

  function subscriptionLimitReached(numBookings, user) {
    switch (user.subscriptionPlan.subscription) {
      case SUBSCRIPTION.trial: {
        if (numBookings >= SUBSCRIPTION_BOOKING_LIMITS.trial) {
          return true;
        }
      }
      case SUBSCRIPTION.basic: {
        if (numBookings >= SUBSCRIPTION_BOOKING_LIMITS.basic) {
          return true;
        }
      }
      case SUBSCRIPTION.premium: {
        if (numBookings >= SUBSCRIPTION_BOOKING_LIMITS.premium) {
          return true;
        }
      }
      case SUBSCRIPTION.unlimited: {
        return false;
      }
    }
  }

  async function venueLimitReached(recentUserBookings, place, user) {
    let numBookings;
    if (!place.bookingLimits) {
      return false;
    }
    const userLevel = user.level || 1;
    let levelBookingLimit = place.bookingLimits[userLevel];
    if (!levelBookingLimit) {
      const definedLevels = Object.entries(place.bookingLimits).sort(([k, v], [k2, v2]) => parseInt(k) - parseInt(k2));
      const firstLargerPair = definedLevels.find(k => parseInt(k[0]) > userLevel);
      const firstLarger = firstLargerPair ? firstLargerPair[0] : null;
      const firstSmallerPair = definedLevels.reverse().find(k => parseInt(k[0]) < userLevel);
      const firstSmaller = firstSmallerPair ? firstSmallerPair[0] : null;
      if (firstLarger && firstSmaller) {
        levelBookingLimit = place.bookingLimits[firstSmaller];
      } else if (firstLarger) {
        levelBookingLimit = place.bookingLimits[firstLarger];
      } else if (firstSmaller) {
        levelBookingLimit = place.bookingLimits[firstSmaller];
      } else {
        return false;
      }
    }
    if (!place.bookingLimitsPeriod || place.bookingLimitsPeriod === BOOKING_LIMIT_PERIODS.week) {
      const recentWeekUserVenueBookings = await Booking.find({
        user: user._id,
        creationDate: {
          $gte: moment.utc().subtract({ days: 7 }).toISOString(),
        },
      }).toArray();
      numBookings = recentWeekUserVenueBookings.filter(booking => booking.place === place._id).length;
    } else {
      numBookings = recentUserBookings.filter(booking => booking.place === place._id).length;
    }
    if (numBookings >= levelBookingLimit) {
      return true;
    }

    return false;
  }

  async function userBookingsLimitReached(user, place) {
    // user can reach limit in two ways, he exceeded his monthly subscription bookings limit
    // or he exceeded his bookings limit for given venue
    const startMonth = moment.utc().startOf('month').toISOString();
    const endMonth = moment.utc().endOf('month').toISOString();
    const recentUserBookings = await Booking.find({
      user: user._id,
      creationDate: {
        $gte: startMonth,
        $lt: endMonth,
      },
    }).toArray();

    let numBookings = recentUserBookings.length;
    if (subscriptionLimitReached(numBookings, user) || await venueLimitReached(recentUserBookings, place, user)) {
      return true;
    }

    return false;
  }

  async function userCanBook(user, place) {
    const { subscriptionPlan: { subscription } } = user;
    if (subscription === SUBSCRIPTION.trial || subscription === SUBSCRIPTION.basic) {
      if (place.access === ACCESS.basic) {
        return true;
      }
      if (place.access === ACCESS.premium) {
        return false;
      }
    }

    if (subscription === SUBSCRIPTION.premium || subscription === SUBSCRIPTION.unlimited) {
      return true;
    }

    return false;
  }

  function placeAllowsUserGender(place, user) {
    return place.allows.includes(user.gender);
  }

  app.post('/api/v2/place/:id/book', async (req, res) => {
    let id = parseInt(req.params.id);
    let userID  = parseInt(req.body.userID);
    let intervalId = req.body.intervalId;
    let date = moment(req.body.date);
    let dayWeek = date.format('dddd');

    if(id && userID && intervalId && date.isValid()){
        let place = await Place.findOne({ _id : id });
        let user = await User.findOne({_id : userID });
        let interval = await Interval.findOne({ place : id });
        let offers = await Offer.find({place: id}).toArray();
        if (!placeAllowsUserGender(place, user)) {
          return res.status(403).json({ message: `Venue does not accept user's gender` });
        }
        offers = generateOfferPrices(offers, user.level);

        let intervals = interval.intervals.map((interval) => {
          interval._id = crypto.createHash('sha1').update(`${interval.start}${interval.end}${interval.day}`).digest("hex");
          return interval;
        });
        let choosenInterval =  intervals.find(x=> x._id == intervalId);

        if(place && user && interval && choosenInterval){
          if(choosenInterval.day && choosenInterval.day == dayWeek){
            if(moment(`${date.format('YYYY-MM-DD')} ${choosenInterval.start.replace('.',':')}`).isValid()){
              let fullDate = moment(`${date.format('YYYY-MM-DD')} ${choosenInterval.start.replace('.',':')}`);
              let timesValidation = await validateTimes(fullDate);

              if(timesValidation.isValid){
                let userValidation = await validateUserPossibility(fullDate, user, offers, place);

                if(userValidation.isValid){
                  let validateInterval = await validateIntervalSlots(choosenInterval, fullDate, place);

                  if(validateInterval.free > 0){
                    if (await userBookingsLimitReached(user, place)) {
                      return res.status(403).json({ message: 'User has exceeded his bookings limit' });
                    }
                    if (!(await userCanBook(user, place))) {
                      return res.status(403).json({ message: `User's subscription plan is insufficient for this venue` });
                    }
                    let newBooking = {
                      _id: await entityHelper.getNewId('bookingid'),
                      user: userID,
                      place: id,
                      date: moment(fullDate).format('DD-MM-YYYY'),
                      creationDate: new Date().toISOString(),
                      closed: false,
                      claimed: false,
                      offers: [],
                      offerActions: [],
                      year: fullDate.year(),
                      week: fullDate.isoWeek(),
                      day: moment(fullDate).format('dddd'),
                      payed: Math.min(...offers.map(x => x.price)) / 2,
                      startTime: choosenInterval.start,
                      endTime: choosenInterval.end
                  }
                  await Booking.insertOne(newBooking);
                  await User.findOneAndUpdate({_id: newBooking.user}, {
                    $push: { bookings: newBooking._id },
                    $inc: { credits: parseInt(-1 * newBooking.payed) }
                  });
                  await sendBookingEmailMessage(place, newBooking);
                  return res.status(200).json({ message: 'Booked' });
                }else{
                  res.status(400).json({message:  'not enaught slots'});
                }
              }else{
                res.status(400).json({message:  userValidation.error});
              }
            }else{
              res.status(400).json({message:  timesValidation.error});
            }
          }else{
            res.status(400).json({message: "invalid date"});
          }
          }else{
            res.status(400).json({message: "choosend date not match for inteval"});
          }
        }else{
          res.status(404).json({message: "invalid parameters"});
        }
    }else{
      res.status(400).json({message: "invalid parameters"});
    }
  });

  validateIntervalSlots = async (choosenInterval, date, place) => {
    let dayOff = null;
    if(place.daysOffs) dayOff = place.daysOffs.find(x=> x.date == date.format('DD-MM-YYYY'));

    if(choosenInterval.day == date.format('dddd')){
      if(dayOff && (dayOff.isWholeDay || dayOff.intervals.filter(x=>x.start == choosenInterval.start && x.end == choosenInterval.end).length > 0)){
        choosenInterval.free = 0;
      }else{
        var taken = await Booking.countDocuments({ place: place._id, date: date.format('DD-MM-YYYY'), startTime: choosenInterval.start, day: choosenInterval.day });
        choosenInterval.free = choosenInterval.slots - taken;
      }
      return choosenInterval;
    }
    return choosenInterval;
  }
  validateUserPossibility = async (fullDate, user, offers, place) => {
    let validation = {
      isValid : false,
      error: ''
    }
    let week = fullDate.isoWeek();
    let year = fullDate.year();
    let usersBookingsWeek = await Booking.countDocuments({ user: user._id, year: year , week: week });
    let usersBookingsWeekPlace = await Booking.countDocuments({ user: user._id, year: year , week: week, place : place._id });
    let usersBookingsSamePlaceDate = await Booking.countDocuments({ user: user._id, place: place._id, date: {$eq: fullDate.format('DD-MM-YYYY')}  });

    if(usersBookingsSamePlaceDate == 0){
      if(place.type.toLowerCase() == 'gym' || (place.type.toLowerCase() != 'gym' && usersBookingsWeek < 10 && usersBookingsWeekPlace < 3)){
        let minOfferPrice =  Math.min(...offers.map(x => x.price)) / 2;
        if(minOfferPrice <= user.credits){
          validation.isValid = true;
        }else{
          validation.error = 'you dont have enaught credits';
        }
      }else{
        validation.error = 'you arleady made max bookings for this week';
      }
    }else{
      validation.error = 'you arleady made booking today here';
    }
    return validation;
  }
  validateTimes = async (fullDate) => {
    let validation = {
      isValid : false,
      error: ''
    }
    if(fullDate.isValid()){
      let rightRange = moment().add(7, 'days');
      var diffSecods = moment.duration(fullDate.diff(moment())).asSeconds();

      //handle 7 days forward
      if(!fullDate.isAfter(rightRange)){
        //check if interval is in past
        if(fullDate.isAfter(moment())){ 
          // check difference between now and inteval is if is bigger then hour
          if(diffSecods > 3600){
            validation.isValid = true;
          }else{
            validation.error = "there must be at least on hour before booking"; 
          }
        }else{
          validation.error = "the slot is in the past";
        }
      }else{
        validation.error = "you can book place max 7 days forward";
      }
    }else{
      validation.error = "invalid date";
    }
    return validation;
}
  

  // Create the Booking and link it with User and the Place
  // Using Intervals for it
  app.post('/api/place/:id/book', async (req, res) => {
    var id = parseInt(req.params.id);
    const { userID } = req.body;
    const p = await Place.findOne({ _id: id });
    if (!p) {
      return res.status(404).json({ message: 'Place not found' });
    }

    if (!userID) {
      return res.json({ message: 'Required fields are not fulfilled' });
    }

    let user;
    try {
      user = await User.findOne({ _id: userID });
    } catch (error) {
      return res.status(500).json({ message: 'Internal server error' });
    }
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    if (!placeAllowsUserGender(p, user)) {
      return res.status(403).json({ message: `Venue does not accept user's gender` });
    }
    if (await userBookingsLimitReached(user, p)) {
      return res.status(403).json({ message: 'User has exceeded his monthly bookings limit' });
    }
    if (!(await userCanBook(user, p))) {
      return res.status(403).json({ message: `User's subscription plan is insufficient for this venue` });
    }

    if (req.body.interval !== undefined && req.body.date && id) {
      var intervalNum = parseInt(req.body.interval);
      const newBooking = {
        user: parseInt(req.body.userID),
        place: id,
        date: req.body.date, //moment(req.body.date).format('DD-MM-YYYY')
        creationDate: new Date().toISOString(),
        closed: false,
        claimed: false,
        offers: [],
        offerActions: [],
      };
      //newBooking.day = moment(req.body.date).format('dddd');

      let minOfferPrice = 0;
      let offers;
      if (req.body.offers) {
        for (var num of req.body.offers) {
          newBooking.offers.push(parseInt(num));
        }
        offers = await Offer.find({_id: {$in: newBooking.offers}}, {projection: {level: 1}}).toArray();
      } else {
        offers = await Offer.find({place: newBooking.place}, {projection: {level: 1}}).toArray();
      }
      offers = generateOfferPrices(offers, user.level);
      const offerPrices = offers.map(o => o.price);
      minOfferPrice = offerPrices.sort((a, b) => a - b)[0];

      Interval.findOne({place: id}, async function (err, interval) {
        if (!interval || !interval.intervals[intervalNum]) {
          res.status(404).json({message: "No intervals for this place"});
        } 
        else {
              newBooking.startTime = interval.intervals[intervalNum]["start"];
              newBooking.endTime = interval.intervals[intervalNum]["end"];
  
              Booking.findOne({
                place: id,
                date: newBooking.date,
                user: newBooking.user,
                closed: false
              }, {projection: {_id: 1}}, function (err, book) {
              if (book) {
                res.status(500);
                res.json({message: "Sorry, you have already booked a spot for that day here"});
              } else {
                Booking.find({
                  place: id,
                  date: newBooking.date,
                  startTime: newBooking.startTime,
                  closed: false
                }, {projection: {_id: 1}}).toArray(function (err, books) {
  
                  Place.findOne({_id: id}, {slots: 1}, function (err, place) {
                    if (!place) {
                      res.json({message: "No such place"});
                    } else {
                      if (books.length >= newBooking.slot) {
                        res.status(500);
                        res.json({message: "Sorry, all slots are booked for this time"});
                      } else {
  
                        // if(moment().isBefore(moment(newBooking.date + ' ' + newBooking.startTime, 'DD-MM-YYYY HH.mm'))) {
                        Counter.findOneAndUpdate({_id: "bookingid"}, {$inc: {seq: 1}}, {new: true}, function (err, seq) {
                          if (err) console.log(err);
                          newBooking._id = seq.value.seq;
                          
                          User.findOne({_id: newBooking.user}, {projection: {credits: 1}}, function (err, user) {
                            if (!user) {
                              res.json({message: "No such user"});
                            } else {
                              if (user.credits < minOfferPrice) {
                                res.status(402);
                                res.json({message: "Sorry, you have not enough credits to book place and take the cheapeste."});
                              } else {
                                newBooking.payed = parseInt(minOfferPrice / 2);
  
                                Place.findOneAndUpdate({_id: id}, {$push: {bookings: seq.value.seq}}, function () {
                                  User.findOneAndUpdate({_id: newBooking.user}, {
                                    $push: {bookings: seq.value.seq},
                                    $inc: {credits: parseInt(minOfferPrice / (-2))}
                                  });
                                  Booking.insertOne(newBooking);
                                  res.json({message: "Booked"});
                                });

                                Booking.insertOne(newBooking).then((booking) => {
                                  sendBookingEmailMessage(place, newBooking).then(()=> {
                                    res.json({message: "Booked"});
                                  });
                                });
                                //res.json({message: "Booked"});
                              };
                            }
                          });
                        });
                      }
                    }
                  });
                });
              }
            });
          }
      });
    } else {
      res.json({message: "Required fields are not fulfilled"});
    }
  });

  app.put('/api/place/book/:id/claim', function (req, res) {

    Booking.findOne({_id: parseInt(req.params.id)}, async function (err, book) {
      if (!book) {
        res.json({message: "No such booking"});
      } else {

        var offers = await Offer.find({_id: {$in: book.offers}}, {projection: {level: 1}}).toArray();
        let user;
        try {
          user = await User.findOne({ _id: book.user });
        } catch (error) {
          return res.status(500).json({ message: 'Internal server error' });
        }
        if (!user) {
          return res.status(404).json({ message: 'User not found' });
        }
        offers = generateOfferPrices(offers, user.level);
        var sum = 0;
        offers.forEach(function (offer) {
          sum += offer.price;
        });
        sum -= book.payed;

        User.findOneAndUpdate({_id: book.user}, {$inc: {credits: sum * (-1)}});

        Booking.findOneAndUpdate({_id: parseInt(req.params.id)}, {
          $set: {claimed: true},
          $inc: {payed: sum}
        }, function (err, book) {
          res.json({message: "Claimed"});
        });
      }
    });
  });
  sendBookingEmailMessage = async (place, booking) => {
    let listToSend = [];
    var user = await User.findOne({_id: booking.user});
    let line = `booking date: ${ booking.date }, time:  ${booking.startTime }-${booking.endTime },`;
    if(user){
      line += ` user:  ${user.email }, ${user.name } ${user.surname } `;
    }
    listToSend.push(line);
    if(place && place.notificationRecivers && Array.isArray(place.notificationRecivers)){
      place.notificationRecivers.forEach(async (reciver) => {
        await sendGrid.sendBookingCreated(reciver.email, listToSend, place);
      });
    }
  }
}