const _ = require('lodash');

var db = require('../../config/connection');

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
/*
  app.get('/api/migrate', async (req, res) => {
    await Offer.updateMany({}, { $set: { isActive: true } });
    await Offer.updateMany({}, { $set: { scopes: ['regular'] } });

    await Place.updateMany({ }, { $set: { allows: ['male', 'female']} });
    await Place.updateMany({ }, { $set: { city: 'Milan' } });
    await Place.updateMany({ }, { $set: { requirements: {} } });

    await Offer.updateMany({}, { $set: { isActive: true } });
    await Offer.updateMany({}, { $set: { scopes: ['regular'] } });

    const a = await Booking.find({}).toArray();

    const ps = await Promise.all(a.map(async (el) => {
      await Booking.replaceOne({ _id: el._id }, { ...el, eventBooking: false });
    }));
    res.send(await Offer.find({}).toArray());

    const a = await Booking.find({}).toArray();

    const ps = await Promise.all(a.map(async (el) => {
      const parts = el.creationDate.split("-");
      el.creationDate = moment(new Date(parts[2], parts[1] - 1, parts[0])).add({days:1}).subtract({hours:22}).toISOString();
      await Booking.replaceOne({ _id: el._id }, el);
    }));

    const users = await User.find({}).toArray();

    await Promise.all(users.map(async (user) => {
      user.subscriptionPlan = { subscription: SUBSCRIPTION.unlimited };
      await User.replaceOne({ _id: user._id }, newUser);
    }));

    const places = await Place.find({}).toArray();

    await Promise.all(places.map(async (place) => {
      place.access = ACCESS.basic;
      await Place.replaceOne({ _id: place._id }, place);
    }));

    await Booking.updateMany({date: '10-03-2019'}, {$set: {closed: false}});
  });

  app.get('/api/revert-migrate', async (req, res) => {
    await Offer.updateMany({}, { $unset: { isActive: '' } });
    await Offer.updateMany({}, { $unset: { scopes: '' } });

    await Place.updateMany({ }, { $unset: { allows: '' } });
    await Place.updateMany({ }, { $unset: { city: '' } });
    await Place.updateMany({ }, { $unset: { requirements: '' } });

    await Offer.updateMany({}, { $unset: { isActive: '' } });
    await Offer.updateMany({}, { $unset: { scopes: '' } });

    await Booking.updateMany({}, { $unset: { eventBooking: '' } });

    await Promise.all(a.map(async (el) => {
      el.creationDate = moment(el.creationDate).format('DD-MM-YYYY');
      await Booking.replaceOne({ _id: el._id }, el);
    }));

    await User.updateMany({}, { $unset: { subscription: '' }});
    await Place.updateMany({}, { $unset: { access: '' }});
  });
  */
}
