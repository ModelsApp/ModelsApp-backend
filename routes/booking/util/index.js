const crypto = require('crypto');
const moment = require('moment');

const sendGrid = require('../../../lib/sendGrid');
const entityHelper = require('../../../lib/entityHelper');
const { SUBSCRIPTION, SUBSCRIPTION_BOOKING_LIMITS } = require('../../../config/constant');
const calculateOfferPoints = require('../../actionPoints/calculator/offer');
const { ACCESS, BOOKING_LIMIT_PERIODS } = require('../../place/constant');

class BookingUtil {
  constructor(Place, User, Interval, Offer, Booking) {
    this.Place = Place;
    this.User = User;
    this.Interval = Interval;
    this.Offer = Offer;
    this.Booking = Booking;
  }

  placeAllowsUserGender(place, user) {
    return place.allows.includes(user.gender);
  }

  generateOfferPrices(offers, userLevel) {
    return offers.map(offer => ({ ...offer, price: calculateOfferPoints(userLevel, offer.level) }));
  }

  async bookPossible(id, userID, intervalId, date) {
    if(!id || !userID || !intervalId || !date.isValid()){
      throw new Error('invalid parameters');
    }
    const dayWeek = date.format('dddd');
    const place = await this.Place.findOne({ _id : id });
    const user = await this.User.findOne({_id : userID });
    const interval = await this.Interval.findOne({ place : id });
    let offers = await this.Offer.find({place: id}).toArray();
    if (!this.placeAllowsUserGender(place, user)) {
      throw new Error(`Venue does not accept user's gender`);
    }
    offers = this.generateOfferPrices(offers, user.level);

    const intervals = interval.intervals.map((interval) => {
      interval._id = crypto.createHash('sha1').update(`${interval.start}${interval.end}${interval.day}`).digest("hex");
      return interval;
    });
    const chosenInterval = intervals.find(x => x._id == intervalId);

    if (!place || !user || !interval || !chosenInterval) {
      throw new Error('invalid parameters');
    }

    if (!chosenInterval.day || chosenInterval.day !== dayWeek) {
      throw new Error('choosen date does not match interval');
    }

    if (!moment(`${date.format('YYYY-MM-DD')} ${chosenInterval.start.replace('.',':')}`).isValid()){
      throw new Error('invalid date');
    }

    let fullDate = moment(`${date.format('YYYY-MM-DD')} ${chosenInterval.start.replace('.',':')}`);
    let timesValidation = await this.validateTimes(fullDate);
    if (!timesValidation.isValid) {
      throw new Error(timesValidation.error);
    }

    let userValidation = await this.validateUserPossibility(fullDate, user, offers, place);
    if (!userValidation.isValid) {
      throw new Error(userValidation.error);
    }

    let validateInterval = await this.validateIntervalSlots(chosenInterval, fullDate, place);

    if (!validateInterval.free > 0) {
      throw new Error('not enough slots');
    }

    if (await this.userBookingsLimitReached(user, place)) {
      throw new Error('User has exceeded his bookings limit');
    }

    if (!(await this.userCanBook(user, place))) {
      throw new Error(`User's subscription plan is insufficient for this venue`);
    }

    return { fullDate, offers, chosenInterval, place };
  }

  async book(id, userID, fullDate, offers, chosenInterval, place) {
    const newBooking = {
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
      startTime: chosenInterval.start,
      endTime: chosenInterval.end,
    }
    const booking = await this.Booking.insertOne(newBooking);
    await this.User.findOneAndUpdate({_id: newBooking.user}, {
      $push: { bookings: newBooking._id },
      $inc: { credits: parseInt(-1 * newBooking.payed) }
    });
    await this.sendBookingEmailMessage(place, newBooking);

    return booking.ops[0];
  }

  async validateTimes(fullDate) {
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
    const book = await this.Booking.findOneAndUpdate({ _id: bookingId }, { $push: {offers: offerId} });
    if (!book.value) {
      throw new Error('No such booking');
    }
    return book;
  }
}

module.exports = (Place, User, Interval, Offer, Booking) => new BookingUtil(Place, User, Interval, Offer, Booking);
