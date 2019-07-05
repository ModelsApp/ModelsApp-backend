var db = require('../config/connection');
var moment = require('moment');
var sendGrid = require('../lib/sendGrid');
var entityHelper = require('../lib/entityHelper');
var crypto = require('crypto');


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

  app.get('/api/place/:id/book/slots', function (req, res) {
    var id = parseInt(req.params.id);
    var reqDate = req.body.date || req.query.date;
    let day = moment(reqDate);
    let date =  moment(reqDate).format('DD-MM-YYYY');
    if(!date) {
      res.json({ message: "Please, provide the date" });
    } else {
      if(day.isValid()){
          Place.findOne({ _id: id }, function (err, place) {
            if(!place) {
              res.json({ message: "No such place" });
            } else {
            Interval.findOne({ place: place._id }, async function (err, intervals) {
              if(!intervals) {
                res.json({ message: "This place has no booking intervals" });
              } else { 
                let dayOff = null;
                if(place.daysOffs) dayOff = place.daysOffs.find(x=> x.date == date);

                var newArr = await Promise.all(intervals.intervals.map(async function (interval) {
                  if(interval.day == day.format('dddd')){
                    if(dayOff && (dayOff.isWholeDay || dayOff.intervals.filter(x=>x.start == interval.start && x.end == interval.end).length > 0)){
                      interval.free = 0;
                    }else{
                      var taken = await Booking.countDocuments({ place: id, date: date, startTime: interval.start, day: interval.day });
                      interval.free = interval.slots - taken;
                    }
                    interval._id = crypto.createHash('sha1').update(`${interval.start}${interval.end}${interval.day}`).digest("hex");
                    interval.timestamp = moment(`2019-01-01 ${interval.start.replace('.',':')}`).format("X");
                    return interval;
                  }
                }));
                res.json(newArr.filter(x=> x != null).sort((a,b) => a.timestamp > b.timestamp));
              }
            });
          }
        });
      }else{
        res.json({message: "Invalid date format, accepted format is YYYY-DD-MM"});
      }
    }
  });

  // Get the specific Booking
  app.get('/api/place/book/:id', function (req, res) {
    var id = parseInt(req.params.id);
    Booking.findOne({_id: id}, async function (err, book) {
      if (!book) {
        res.json({message: "No such booking"});
      } else {

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
                    let newBooking = {
                      _id: await entityHelper.getNewId('bookingid'),
                      user: userID,
                      place: id,
                      date: moment(fullDate).format('DD-MM-YYYY'),
                      creationDate: moment().format('DD-MM-YYYY'),
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
                    $push: {bookings: newBooking._id},
                    $inc: {credits: parseInt(-1 * newBooking.payed)}
                  });
                  await sendBookingEmailMessage(place, newBooking);
                  res.status(200).json({message: "Booked"});
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
  app.post('/api/place/:id/book', async function (req, res) {
    var id = parseInt(req.params.id);

    if (req.body.userID && req.body.interval !== undefined && req.body.date && id) {

      var intervalNum = parseInt(req.body.interval);
      var newBooking = {};
      newBooking.user = parseInt(req.body.userID);
      newBooking.place = id;
      newBooking.date = req.body.date; //moment(req.body.date).format('DD-MM-YYYY');
      newBooking.creationDate = moment().format('DD-MM-YYYY');
      newBooking.closed = false;
      newBooking.claimed = false;
      newBooking.offers = [];
      newBooking.offerActions = [];
      //newBooking.day = moment(req.body.date).format('dddd');

      var minOffer;
      var minOfferPrice = 0;
      if (req.body.offers) {
        for (var num of req.body.offers) {
          newBooking.offers.push(parseInt(num));
        }
        minOffer = await Offer.find({_id: {$in: newBooking.offers}}, {projection: {price: 1}}).sort({price: 1}).limit(1).toArray();
        minOfferPrice = minOffer[0]['price'];
      } else {
        minOffer = await Offer.find({place: newBooking.place}, {projection: {price: 1}}).sort({price: 1}).limit(1).toArray();
        minOfferPrice = minOffer[0]['price'];
      }

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

        var offers = await Offer.find({_id: {$in: book.offers}}, {projection: {price: 1}}).toArray();
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