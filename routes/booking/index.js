const _ = require('lodash');
const moment = require('moment');
const crypto = require('crypto');

const newBookingUtil = require('./util');
const middleware = require('./../../config/authMiddleware');
const ErrorResponse = require('./../../core/errorResponse');

module.exports = (app, placeRepository, userRepository, bookingRepository, eventBookingRepository, eventRepository, placeUtil,
  User, Place, Offer, Counter, Booking, OfferPost, Interval, SamplePost) => {

  const bookingUtil = newBookingUtil(Place, User, Interval, Offer, Booking, placeUtil);

  app.get('/api/place/:id/book/slots', async (req, res, next) => {
    try {
      const id = parseInt(req.params.id);
      const reqDate = req.body.date || req.query.date;
      const day = moment(reqDate);
      const date = moment(reqDate).format('DD-MM-YYYY');
      if(!date) {
        throw ErrorResponse.BadRequest('Please, provide the date');
      }
      if (!day.isValid()) {
        throw ErrorResponse.BadRequest('Invalid date format, accepted format is YYYY-DD-MM');
      }
      const place = await placeRepository.findById(id);
      if (!place) {
        throw ErrorResponse.NotFound('Wrong place id');
      }

      const singlePlaceSlots = await getSinglePlaceSlots(place, day, date);
      if (!singlePlaceSlots) {
        throw ErrorResponse.NotFound('This place has no booking intervals');
      }
      return res.status(200).json(singlePlaceSlots);
    } catch (error) {
      return next(error);
    }
  });

  app.get('/api/booking/my-bookings', middleware.isAuthorized, async (req, res, next) => {
    try {
      const user = await req.user;
      const result = {};

      const regularBookings = await bookingRepository.findAllRegularBookingsForUser(user._id);
      result.regular = regularBookings;

      let eventBookings = await eventBookingRepository.findAllForUser(user._id);
      eventBookings = await Promise.all(eventBookings.map(async (eb) => ({
        ...eb,
        event: await eventRepository.findById(eb.eventId),
      })));
      eventBookings = await Promise.all(eventBookings.map(async (eb) => ({
        ...eb,
        event: await eventRepository.joinPlace(eb.event),
      })));
      result.event = eventBookings;
      return res.status(200).json(result);
    } catch (error) {
      return next(error);
    }
  });

  // Where do we use this endpoint, why not GET v2/place?
  app.post('/api/place/book/slots', async (req, res, next) => {
    try {
      const { date: reqDate } = req.body;
      if (!reqDate) {
        throw ErrorResponse.BadRequest('Please, provide the date');
      }
      const day = moment(reqDate);
      const date = moment(reqDate).format('DD-MM-YYYY');
      const places = await Place.find({ isActive : true }).toArray();
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

      return res.json(placesSlots.sort((a, b) => b.freeSpots - a.freeSpots));
    } catch (error) {
      return next(error);
    }
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
  app.get('/api/place/book/:id', async (req, res, next) => {
    try {
      const id = parseInt(req.params.id);
      const booking = await bookingRepository.findById(id);

      if (!booking) {
        throw ErrorResponse.NotFound('Wrong id!');
      }

      const user = await userRepository.findById(booking.user);
      if (!user) {
        throw ErrorResponse.NotFound('User not found');
      }

      // Check if the booking is older than 24 hours
      const date = moment(booking.date + ' ' + booking.endTime, 'DD-MM-YYYY HH.mm');
      const tommorow = moment(date.add('1', 'days').format('DD-MM-YYYY'), 'DD-MM-YYYY');
      const diff = tommorow.diff(moment(), 'days');
      if (diff < 0 && !booking.closed) {
        await bookingRepository.close(booking._id);
        booking.closed = true;
      }

      booking.place = await placeRepository.findById(booking.place);
      if (booking.place) {
        booking.place.photos = booking.place.photos[0];
      }
      if (booking.offers) {
        booking.offers = await Offer.find({_id: {$in: booking.offers}}).toArray();
        booking.offers = bookingUtil.generateOfferPrices(booking.offers, user.level);
      }

      return res.status(200).json({ place: booking });
    } catch (error) {
      return next(error);
    }
  });

  // Get all the bookings belonging to specified place
  app.get('/api/place/:id/book', async (req, res, next) => {
    try {
      const id = parseInt(req.params.id);
      const bookings = await bookingRepository.findWhere({ place: id });
      const bookingsMapped = await Promise.all(bookings.map(async (booking) => {
        const place = await placeRepository.findById(booking.place);
        if (!place) {
          booking.place = {};
        } else {
          place.photo = place.mainImage;
          delete place.photos;
          booking.place = place;
        }
  
        const date = moment(book.date + ' ' + book.endTime, 'DD-MM-YYYY HH.mm');
        const tommorow = moment(date.add('1', 'days').format('DD-MM-YYYY'), 'DD-MM-YYYY');
        const diff = tommorow.diff(moment(), 'days');
        if (diff < 0 && !book.closed) {
          await bookingRepository.close(book._id);
          booking.closed = true;
        }
  
        if (diff < 0) {
          return;
        }
  
        return booking;
      })).filter(booking => booking);
  
      return res.status(200).json(bookingsMapped);
    } catch (error) {
      return next(error);
    }
  });

  // Deletes the booking document and all links to it
  app.delete('/api/place/book/:id', async (req, res, next) => {
    try {
      const id = parseInt(req.params.id);
      if (!id) {
        throw ErrorResponse.BadRequest('Incorrect id');
      }
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
      const offerId = parseInt(req.body.offerID);
  
      const book = await bookingUtil.addOfferToBooking(id, offerId);
      return res.status(200).json({ message: 'Added', data: book });
    } catch (error) {
      next(error);
    }
  });

  // Close the Booking
  app.put('/api/place/book/:id', async (req, res, next) => {
    try {
      const id = parseInt(req.params.id);
      await bookingRepository.close(id);
  
      return res.status(200).json({ message: 'Booking closed' });
    } catch (error) {
      return next(error);
    }
  });

  app.post('/api/v2/place/:id/book', async (req, res, next) => {
    const id = parseInt(req.params.id);
    const userID = parseInt(req.body.userID);
    const intervalId = req.body.intervalId;
    const date = moment(req.body.date);

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
    try {
      const id = parseInt(req.params.id);
      const { userID, interval, date } = req.body;

      if (!id) {
        throw ErrorResponse.BadRequest('Provide place id');
      }
      if (!userID) {
        throw ErrorResponse.BadRequest('Provide user id');
      }
      if (!interval) {
        throw ErrorResponse.BadRequest('Provide interval');
      }
      if (!date) {
        throw ErrorResponse.BadRequest('Provide date');
      }

      const p = await placeRepository.findById(id);
      if (!p) {
        throw ErrorResponse.NotFound('Place not found');
      }
      const user = await userRepository.findById(userID);
      if (!user) {
        throw ErrorResponse.NotFound('User not found');
      }

      if (!bookingUtil.placeAllowsUserGender(p, user)) {
        throw ErrorResponse.Unauthorized(`Venue does not accept user's gender`);
      }
      if (await bookingUtil.userBookingsLimitReached(user, p)) {
        throw ErrorResponse.Unauthorized(`User has exceeded his monthly bookings limit`);
      }
      if (!(await bookingUtil.userCanBook(user, p))) {
        throw ErrorResponse.Unauthorized(`User's subscription plan is insufficient for this venue`);
      }

      const intervalNum = parseInt(interval);
      const newBooking = {
        user: parseInt(req.body.userID),
        place: id,
        date, //moment(req.body.date).format('DD-MM-YYYY')
        creationDate: new Date().toISOString(),
        closed: false,
        claimed: false,
        offers: [],
        offerActions: [],
      };

      // refactor this further
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
      offers = bookingUtil.generateOfferPrices(offers, user.level);
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

    } catch (error) {
      return next(error);
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