const _ = require('lodash');
const moment = require('moment');
const crypto = require('crypto');

const db = require('../../config/connection');
const newBookingUtil = require('./util');
const middleware = require('./../../config/authMiddleware');

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

module.exports = (app, bookingRepository, eventBookingRepository, eventRepository, placeUtil) => {

  const bookingUtil = newBookingUtil(Place, User, Interval, Offer, Booking, placeUtil);

  /* migrate Booking, add eventBooking field */
  /*
  app.get('/api/booking/migrate', async (req, res) => {
    const a = await Booking.find({}).toArray();

    const ps = await Promise.all(a.map(async (el) => {
      await Booking.replaceOne({ _id: el._id }, { ...el, eventBooking: false });
    }));

    res.send(ps);
  });
  */


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

  app.get('/api/booking/my-bookings', middleware.isAuthorized, async (req, res, next) => {
    try {
      const user = await req.user;
      const result = {};

      const regularBookings = await bookingRepository.findAllRegularBookingsForUser(user._id);
      result.regular = regularBookings;

      let eventBookings = await eventBookingRepository.findAllForUser(user._id);
      eventBookings = await Promise.all(eventBookings.map(async (eb) => ({ ...eb, event: await eventRepository.findById(eb.eventId) })));
      result.event = eventBookings;
      return res.status(200).json(result);
    } catch (error) {
      return next(error);
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

  // Get the specific Booking
  app.get('/api/place/book/:id', (req, res, next) => {
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
          try {
            book.offers = bookingUtil.generateOfferPrices(book.offers, user.level);
          } catch (error) {
            return next(error);
          }
          return res.json({ place: book });
        } else {
          return res.json({ place: book });
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
  app.delete('/api/place/book/:id', async (req, res, next) => {
    const id = parseInt(req.params.id);
    try {
      const response = await bookingUtil.unbook(id);
      return res.status(response.status).json(response.message);
    } catch (error) {
      return next(error);
    }
  });

  // Add offer to the booking
  app.put('/api/place/book/:id/offer', async (req, res, next) => {
    try {
      const id = parseInt(req.params.id);
      const offer = parseInt(req.body.offerID);
  
      await bookingUtil.addOfferToBooking(id, offer);
    } catch (error) {
      next(error);
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

  app.post('/api/v2/place/:id/book', async (req, res, next) => {
    let id = parseInt(req.params.id);
    let userID = parseInt(req.body.userID);
    let intervalId = req.body.intervalId;
    let date = moment(req.body.date);

    try {
      const { fullDate, offers, chosenInterval, place } = await bookingUtil.bookPossible(id, userID, intervalId, date);
      await bookingUtil.book(id, userID, fullDate, offers, chosenInterval, place);
    } catch (error) {
      next(error);
    }

    return res.status(200).json({ message: 'Booked' });
  });

  // Create the Booking and link it with User and the Place
  // Using Intervals for it
  app.post('/api/place/:id/book', async (req, res, next) => {
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

    try {
      if (!bookingUtil.placeAllowsUserGender(p, user)) {
        return res.status(403).json({ message: `Venue does not accept user's gender` });
      }
      if (await bookingUtil.userBookingsLimitReached(user, p)) {
        return res.status(403).json({ message: 'User has exceeded his monthly bookings limit' });
      }
      if (!(await bookingUtil.userCanBook(user, p))) {
        return res.status(403).json({ message: `User's subscription plan is insufficient for this venue` });
      }
    } catch (error) {
      return next(error);
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
      try {
        offers = bookingUtil.generateOfferPrices(offers, user.level);
      } catch (error) {
        return next(error);
      }
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
                                res
                                  .status(402)
                                  .json({
                                    message: "Sorry, you don't have enough credits.",
                                  });
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
                                  bookingUtil.sendBookingEmailMessage(place, newBooking).then(()=> {
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

  app.put('/api/place/book/:id/claim', function (req, res, next) {

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
        try {
          offers = bookingUtil.generateOfferPrices(offers, user.level);
        } catch (error) {
          return next(error);
        }
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
}