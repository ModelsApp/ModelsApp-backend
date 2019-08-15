var db = require('../../config/connection');
var moment = require('moment');
var entityHelper = require('../../lib/entityHelper');
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

  // Get Booking Intervals for the specific place
  app.get('/api/place/:id/intervals', function (req, res) {
      var id = parseInt(req.params.id);
      Interval.findOne({place: id}, function (err, interval) {
        if (!interval) {
          res.status(404).json({message: "No such intervals"});
        } else {
          res.status(200).json(toIntervalViewModel(interval));
        }
      })
  });
app.put('/api/place/:id/intervals/:intervalId', async function (req, res) {
    var placeId = parseInt(req.params.id);
    var intervalId = parseInt(req.params.intervalId);
    var slotId = req.body.slotId;

    if(placeId && intervalId){
          let interval = await Interval.findOne({ _id: intervalId , place : placeId });
          if(interval){
            let isValid = validateSingleInterval(req.body);
            let isOfferValid = await validateOffers(req.body.offers, placeId);
            if(isValid && isOfferValid){
              //existing slot let 
                if(slotId){
                  interval.intervals = interval.intervals.map(interval => {
                    let id = crypto.createHash('sha1').update(`${interval.start}${interval.end}${interval.day}`).digest("hex");
                    if(id == slotId){
                      interval.start = req.body.start;
                      interval.end = req.body.end;
                      interval.day = req.body.day;
                      interval.slots = req.body.slots;
                      interval.offers = req.body.offers;
                    }
                    return interval;
                  });
                  await Interval.replaceOne({_id : intervalId }, interval);

                  res.status(200).json({message : "updated", interval:  toIntervalViewModel(interval)});
                }else{
                  interval.intervals.push({
                    start: req.body.start,
                    end: req.body.end,
                    slots: req.body.slots,
                    day: req.body.day,
                    offers: req.body.offers
                  });
                  await Interval.replaceOne({_id : intervalId }, interval);
                  res.status(200).json({message : "added", interval: toIntervalViewModel(interval)});
                }
            }else{
              res.status(400).json({message: "Interval not valid: should have start, end, slots, day: (english day of week)"})
            }
        }else{
          res.status(404).json({message : "interval not found"});
        }
    }else{
      res.status(400).json({message : "invalid parameters: placeId, intervalId, offerId, slotId"});
    }
});
  app.delete('/api/place/:id/intervals/:intervalId', async function (req, res) {
    var placeId = parseInt(req.params.id);
    var intervalId = parseInt(req.params.intervalId);
    var slotId = req.body.slotId;

    if(placeId && intervalId && slotId){
          let interval = await Interval.findOne({ _id: intervalId , place : placeId });
          if(interval){
            interval.intervals = interval.intervals.map(interval => {
              interval._id = crypto.createHash('sha1').update(`${interval.start}${interval.end}${interval.day}`).digest("hex");
              return interval;
            });
            interval.intervals = interval.intervals.filter(interval => interval._id != slotId);
            interval.intervals = interval.intervals.map(interval => {
              delete interval._id;
              return interval;
            });
            await Interval.replaceOne({_id : intervalId }, interval);

            res.status(200).json({message : "updated", interval: toIntervalViewModel(interval)});
        }else{
          res.status(404).json({message : "interval not found"});
        }
    }else{
      res.status(400).json({message : "invalid parameters: placeId, intervalId, offerId, slotId"});
    }
  });
}

toIntervalViewModel = (interval) => {
  interval.intervals = interval.intervals.map(interval => {
    interval._id = crypto.createHash('sha1').update(`${interval.start}${interval.end}${interval.day}`).digest("hex");
    return interval;
  });
  return interval;
}
validateIntervals = (intervals) => {
   
    let isValid = true;
    if(intervals && Array.isArray(intervals)){
      intervals.forEach((interval) => {
        isValid = validateSingleInterval(interval);
        interval.slots = parseInt(interval.slots);
      });
    }else{
      isValid = false;
    }
    return isValid;
  }
  validateOffers = async (offers, placeId) => {
    let dBOffers =  await Offer.find({ place : placeId }).toArray();
    let isValid = true;
    if(offers && Array.isArray(offers) && dBOffers && Array.isArray(dBOffers)){
      offers.forEach(id => {
        if(!dBOffers.find(offer => offer._id == id)){
          isValid = false;
        }
      });
    }else{
      isValid = false;
    }
    return isValid;
  }
  validateSingleInterval = (interval) => {
    let requiredProperties = ['start', 'end', 'day', 'slots'];
    let availableDays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
    let isValid = true;
    let objectKeys = Object.keys(interval);
    requiredProperties.forEach(key => {
      let foundKey =  objectKeys.find(x=> x == key);
      if(foundKey){
        if(foundKey == 'start'){
          if(moment(`2019-01-01 ${interval.start.replace('.',':')}`).isValid()){
            interval.start = moment(`2019-01-01 ${interval.start.replace('.',':')}`).format('HH.mm');
          }else{
            isValid = false;
          }
        }
        if(foundKey == 'end'){
          if(moment(`2019-01-01 ${interval.end.replace('.',':')}`).isValid()){
            interval.end = moment(`2019-01-01 ${interval.end.replace('.',':')}`).format('HH.mm');
          }else{
            isValid = false;
          }
        }
        if(foundKey == 'day'){
          if(!availableDays.find(x=> x == interval[foundKey])){
            isValid = false;
          }
        }
      }else{
        isValid = false;
      }
    });
    return isValid;
  }