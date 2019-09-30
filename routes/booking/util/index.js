const crypto = require('crypto');
const moment = require('moment');

const sendGrid = require('../../../lib/sendGrid');
const { SUBSCRIPTION, SUBSCRIPTION_BOOKING_LIMITS } = require('../../../config/constant');
const calculateOfferPoints = require('../../actionPoints/calculator/offer');
const { ACCESS, BOOKING_LIMIT_PERIODS } = require('../../place/constant');
const ErrorResponse = require('./../../../core/errorResponse');
const pushProvider = require('../../../lib/pushProvider');

class BookingUtil {
  constructor(Place, User, Interval, Offer, Booking, placeUtil, getNewId) {
    this.Place = Place;
    this.User = User;
    this.Interval = Interval;
    this.Offer = Offer;
    this.Booking = Booking;
    this.placeUtil = placeUtil;
    this.getNewId = getNewId;
  }

  placeAllowsUserGender(place, user) {
    return place.allows.includes(user.gender);
  }

  generateOfferPrices(offers, userLevel) {
    return offers.map(offer => ({ ...offer, price: calculateOfferPoints(userLevel, offer.level) }));
  }
  
  async getPlaceIntervals(placeId) {
    const interval = await this.Interval.findOne({ place: placeId });
    const intervals = interval.intervals.map((interval) => {
      interval._id = crypto.createHash('sha1').update(`${interval.start}${interval.end}${interval.day}`).digest("hex");
      return interval;
    });
    return intervals;
  }

  async bookPossible(id, userID, intervalId, date, omitLimits = false) {
    if(!id || !userID || !intervalId || !date.isValid()){
      throw ErrorResponse.BadRequest('Invalid parameters');
    }
    const dayWeek = date.format('dddd');
    const place = await this.Place.findOne({ _id : id });
    const user = await this.User.findOne({_id : userID });
    let offers = await this.Offer.find({ place: id, isActive: true }).toArray();
    if (!omitLimits && !this.placeAllowsUserGender(place, user)) {
      throw ErrorResponse.Unauthorized(`Venue does not accept user's gender`);
    }
    offers = this.generateOfferPrices(offers, user.level);

    const intervals = await this.getPlaceIntervals(id)
    const chosenInterval = intervals.find(x => x._id == intervalId);

    if (!place || !user || !intervalId || !chosenInterval) {
      throw ErrorResponse.BadRequest('Invalid interval');
    }

    if (!chosenInterval.day || chosenInterval.day !== dayWeek) {
      throw ErrorResponse.BadRequest('Chosen date does not match interval');
    }

    if (!moment(`${date.format('YYYY-MM-DD')} ${chosenInterval.end.replace('.',':')}`).isValid()){
      throw ErrorResponse.BadRequest('Invalid date');
    }

    let fullDate = moment(`${date.format('YYYY-MM-DD')} ${chosenInterval.end.replace('.',':')}`);
    let timesValidation = await this.validateTimes(fullDate);
    if (!timesValidation.isValid) {
      throw ErrorResponse.BadRequest(timesValidation.error);
    }

    let userValidation = await this.validateUserPossibility(fullDate, user, offers, place);
    const minOfferPrice =  Math.min(...offers.map(x => x.price)) / 2;
    if (!(minOfferPrice <= user.credits)){
      throw ErrorResponse.Unauthorized('Not enough credits');
    }
    if (!omitLimits && !userValidation.isValid) {
      throw ErrorResponse.BadRequest(userValidation.error);  
    }

    let validateInterval = await this.validateIntervalSlots(chosenInterval, fullDate, place);

    if (!validateInterval.free > 0) {
      throw ErrorResponse.Unauthorized('not enough slots');
    }

    if (!omitLimits && await this.userBookingsLimitReached(user, place)) {
      throw ErrorResponse.Unauthorized('User has exceeded his bookings limit');
    }

    if (!omitLimits && !(await this.userCanBook(user, place))) {
      throw ErrorResponse.Unauthorized(`User's subscription plan is insufficient for this venue`);
    }

    return { fullDate, offers, chosenInterval, place };
  }

  async book(id, userID, fullDate, offers, chosenInterval, place, eventBooking = false) {
    if (!place.isActive) {
      throw ErrorResponse.Unauthorized('Cannot book inactive place');
    }
    const newBooking = {
      _id: await this.getNewId('bookingid'),
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
      startTime: chosenInterval.start,
      endTime: chosenInterval.end,
      eventBooking,
    }
    const booking = await this.Booking.insertOne(newBooking);
    await this.User.findOneAndUpdate({_id: newBooking.user}, {
      $push: { bookings: newBooking._id },
      $inc: { credits: parseInt(-1 * newBooking.payed) }
    });
    await this.sendBookingEmailMessage(place, newBooking);

    return booking.ops[0];
  }

  async unbook(id) {
    const booking = await this.Booking.findOne({ _id: id });
    if (!booking) {
      throw ErrorResponse.NotFound('No such booking');
    }
    if (booking.closed) {
      throw ErrorResponse.Unauthorized('The booking is closed and could not be deleted');
    }
    const timeDiff = moment(booking.date + ' ' + booking.startTime, 'DD-MM-YYYY HH.mm').diff(moment(), 'minutes');

    if (timeDiff < 60) {
      throw ErrorResponse.Unauthorized('Could not be deleted. Less than one hours left');
    }

    let place = await this.Place.findOneAndUpdate({ _id: parseInt(booking.place) }, { $pull: { bookings: id } });
    place = place.value;
    if (!place) {
      throw ErrorResponse.NotFound('Could not be deleted');
    }

    const user = await this.User.findOneAndUpdate({ _id: parseInt(booking.user) }, {
      $pull: { bookings: id },
      $inc: { credits: booking.payed },
    });

    if (!user.value) {
      throw ErrorResponse.NotFound('Could not be deleted');
    }

    const deleted = await this.Booking.deleteOne({ _id: id });
    if (deleted.deletedCount === 1) {
      if (place.notifyUsersBooking && await this.placeUtil.getPlaceFreeSpots(place, booking.date) === 1) {
        const devicesToNotify = place.notifyUsersBooking[booking.date];
        if (devicesToNotify) {
          await pushProvider.freedBookingSpotNotification(devicesToNotify, place);
        }
      }
      return { status: 200, message: { message: 'Deleted' } };
    } else {
      throw ErrorResponse.Internal('Not deleted');
    }
  }

  async validateTimes(fullDate) {
    let validation = {
      isValid : false,
      error: ''
    }
    if (!fullDate.isValid()) {
      validation.error = "invalid date";
      return validation;
    }
    const rightRange = moment().add(7, 'days');
    const diffSeconds = moment.duration(fullDate.diff(moment())).asSeconds();

    if (fullDate.isAfter(rightRange)) {
      validation.error = "you can book place max 7 days forward";
      return validation;
    }

    if (!fullDate.isAfter(moment())) {
      validation.error = "the slot is in the past";
      return validation;
    }

    if (diffSeconds <= 1800) {
      validation.error = "booking has to happen at least 30 minutes before timeframe end"; 
      return validation;
    }

    validation.isValid = true;
    return validation;
  }

  async validateUserPossibility(fullDate, user, offers, place) {
    let validation = {
      isValid : false,
      error: ''
    }
    let week = fullDate.isoWeek();
    let year = fullDate.year();
    let usersBookingsWeek = await this.Booking.countDocuments({ user: user._id, year: year , week: week });
    let usersBookingsWeekPlace = await this.Booking.countDocuments({ user: user._id, year: year , week: week, place : place._id });
    let usersBookingsSamePlaceDate = await this.Booking.countDocuments({ user: user._id, place: place._id, date: {$eq: fullDate.format('DD-MM-YYYY')}  });

    if(usersBookingsSamePlaceDate == 0){
      if(place.type.toLowerCase() == 'gym' || (place.type.toLowerCase() != 'gym' && usersBookingsWeek < 10 && usersBookingsWeekPlace < 3)){
        let minOfferPrice =  Math.min(...offers.map(x => x.price)) / 2;
        if(minOfferPrice <= user.credits){
          validation.isValid = true;
        }else{
          validation.error = 'you dont have enaught credits';
        }
      }else{
        validation.error = 'you already made max bookings for this week';
      }
    }else{
      validation.error = 'you already made booking today here';
    }
    return validation;
  }

  async validateIntervalSlots(chosenInterval, date, place) {
    let dayOff = null;
    if(place.daysOffs) dayOff = place.daysOffs.find(x=> x.date == date.format('DD-MM-YYYY'));
    if(chosenInterval.day == date.format('dddd')){
      if(dayOff && (dayOff.isWholeDay || dayOff.intervals.filter(x=>x.start == chosenInterval.start && x.end == chosenInterval.end).length > 0)){
        chosenInterval.free = 0;
      }else{
        var taken = await this.Booking.countDocuments({ place: place._id, date: date.format('DD-MM-YYYY'), startTime: chosenInterval.start, day: chosenInterval.day });
        chosenInterval.free = chosenInterval.slots - taken;
      }
      return chosenInterval;
    }
    return chosenInterval;
  }

  async userBookingsLimitReached(user, place) {
    // user can reach limit in two ways, he exceeded his monthly subscription bookings limit
    // or he exceeded his bookings limit for given venue
    const startMonth = moment.utc().startOf('month').toISOString();
    const endMonth = moment.utc().endOf('month').toISOString();
    const recentUserBookings = await this.Booking.find({
      user: user._id,
      creationDate: {
        $gte: startMonth,
        $lt: endMonth,
      },
      eventBooking: false,
    }).toArray();

    const numBookings = recentUserBookings.length;
    if (this.subscriptionLimitReached(numBookings, user) || await this.venueLimitReached(recentUserBookings, place, user)) {
      return true;
    }

    return false;
  }

  async userCanBook(user, place) {
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

  async sendBookingEmailMessage (place, booking) {
    let listToSend = [];
    var user = await this.User.findOne({_id: booking.user});
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

  subscriptionLimitReached(numBookings, user) {
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

  async venueLimitReached(recentUserBookings, place, user) {
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
      const recentWeekUserVenueBookings = await this.Booking.find({
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

  async addOfferToBooking(bookingId, offerId) {
    const book = await this.Booking.findOneAndUpdate({ _id: bookingId }, { $push: { offers: offerId } });
    if (!book.value) {
      throw new Error('No such booking');
    }
    return book.value;
  }
}

module.exports = (
  Place, User, Interval, Offer, Booking, placeUtil, getNewId,
) => new BookingUtil(Place, User, Interval, Offer, Booking, placeUtil, getNewId);
