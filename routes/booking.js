var db = require('../config/connection');
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

module.exports = function(app) {

  app.get('/api/place/:id/book/slots', function (req, res) {
    var id = parseInt(req.params.id);
    var date = req.query.date;

    if(!date) {
      res.json({ message: "Please, provide the date" });
    } else {
      Place.findOne({ _id: id }, function (err, place) {
        if(!place) {
          res.json({ message: "No such place" });
        } else {
          Interval.findOne({ _id: place.intervals }, async function (err, intervals) {
            if(!intervals) {
              res.json({ message: "This place has no booking intervals" });
            } else {
              var newArr = await Promise.all(intervals.intervals.map(async function (interval) {
              var taken = await Booking.countDocuments({ place: id, date: date, startTime: interval.start });
                interval.free = place.slots - taken;
                return interval;
              }));
              res.json(newArr);
            }
          });
        }
      });
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
          projection: { name: 1, type: 1, description: 1, socials: 1, location: 1, address: 1, photos: 1 }
        });
        if (!place) {
          book.place = {};
        } else {
          place.photo = place.photos[0];
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
        var timeDiff = moment(book.date + ' ' + book.startTime, 'DD-MM-YYYY HH.mm').diff(moment(), 'hours');

        if (timeDiff < 3) {
          res.status(500);
          res.json({message: "Could not be deleted. Less than 3 hours left"});
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
  //delete booking slot 
  app.delete('/api/place/:id/intervals',function(req,res){
    var id = parseInt(req.params.id);
    if(req.body.id){
      Interval.updateOne({place:id,"intervals.id":req.body.id},{$pull:{intervals:{id:req.body.id}}},function(err,data){
        if(err) {
              res.status(500);
            res.json({message:"Not deleted"});
            }else{
              res.json({message:"deleted"});
            } 
      });
    }else{
      Interval.deleteOne({place:id},function(err,deleted){
        if(err) {
          res.status(500);
        res.json({message:"Not deleted"});
        }else{
          res.json({message:"deleted"});
        }
      })
    } 

  });

  // Create the Booking Intervals entity
  app.post('/api/place/:id/intervals', function (req, res) {
    var id = parseInt(req.params.id);
    var interval = {};
    interval.intervals = req.body.intervals;
    interval.place = id;

    Counter.findOneAndUpdate(
      {_id: "intervalsid"},
      {$inc: {seq: 1}},
      {new: true},
      function (err, seq) {
        if (err) console.log(err);
        interval._id = seq.value.seq;

        Place.find({_id: id},  function (err, place) {

          if (!place) {
            res.json({message: "No such place "});
          } else {
            Interval.find({place:id},function(err,data){
            if(data){
              Interval.deleteOne({place:id},function(err,doc){
                if(err) res.status(400).send({message:"errror"});
                Interval.insertOne(interval);
               res.json({message: "Booking intervals are added"});
              })
            }else{
              Interval.insertOne(interval);
              res.json({message: "1st Booking intervals are added"});
            }
            })
            
          }
        })
      }
    );
  });

  // Get Booking Intervals for the specific place
  app.get('/api/place/:id/intervals', function (req, res) {
    var id = parseInt(req.params.id);
      if(req.body.id){
       Interval.aggregate(
          [
            {
              $match: {
                  place:id,"intervals.id":req.body.id
              }
            },
            {
              $addFields: {
                intervals:{
                    $filter:{
                      input:"$intervals",
                      as:"sp",
                      cond:{$eq:["$$sp.id",req.body.id]}  
                    }
                  }
              }
            },
        
          ]).toArray(function(err, docs) {
            console.log(docs);
            if (err) {
              res.json({message: "No such intervals"});
            } else {
              res.json(docs);
            }
      })
           
      }
      else{
        Interval.findOne({place: id}, function (err, interval) {
          if (!interval) {
            res.json({message: "No such intervals"});
          } else {
            res.json(interval);
          }
        })
      }
    
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


  // Create the Booking and link it with User and the Place
  // Using Intervals for it
  app.post('/api/place/:id/book', async function (req, res) {
    var id = parseInt(req.params.id);

    if (req.body.userID && req.body.interval !== undefined && req.body.date && id) {

      var intervalNum = parseInt(req.body.interval);
      var newBooking = {};
      newBooking.user = parseInt(req.body.userID);
      newBooking.place = id;
      newBooking.date = req.body.date;
      newBooking.creationDate = moment().format('DD-MM-YYYY');
      newBooking.closed = false;
      newBooking.claimed = false;
      newBooking.offers = [];

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

      Interval.findOne({place: id}, function (err, interval) {
        console.log(interval.intervals[intervalNum])
        if (!interval) {
          res.status(500);
          res.json({message: "No intervals for this place"});
        } else {
          newBooking.startTime = interval.intervals[intervalNum]["start"];
          newBooking.endTime = interval.intervals[intervalNum]["end"];
          newBooking.slot = interval.intervals[intervalNum]["slot"];

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
                              res.json({message: "Sorry, you have not enough credits."});
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
                            }
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
}
