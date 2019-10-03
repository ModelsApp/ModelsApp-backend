const _ = require('lodash');
const moment = require('moment');

module.exports = (app, User, Place, Offer, Counter, Booking, OfferPost, Interval, SamplePost) => {
  app.get('/api/migrate', async (req, res) => {
    console.log('1');
    await Offer.updateMany({}, { $set: { isActive: true } });
    await Offer.updateMany({}, { $set: { scopes: ['regular'] } });

    await Place.updateMany({ }, { $set: { allows: ['male', 'female']} });
    await Place.updateMany({ }, { $set: { city: 'Milan' } });
    await Place.updateMany({ }, { $set: { requirements: {} } });
    console.log('2');

    await Offer.updateMany({}, { $set: { isActive: true } });
    await Offer.updateMany({}, { $set: { scopes: ['regular'] } });

    let a, ps, users, places;
    a = await Booking.find({}).toArray();

    ps = await Promise.all(a.map(async (el) => {
      await Booking.replaceOne({ _id: el._id }, { ...el, eventId: null });
    }));
    console.log('3');
    
    a = await Booking.find({}).toArray();

    ps = await Promise.all(a.map(async (el) => {
      try {
        const parts = el.creationDate.split("-");
        el.creationDate = moment(new Date(parts[2], parts[1] - 1, parts[0])).add({days:1}).subtract({hours:22}).toISOString();
        await Booking.replaceOne({ _id: el._id }, el);
      } catch (err) {}
    }));
    console.log('4');

    users = await User.find({}).toArray();

    await Promise.all(users.map(async (newUser) => {
      newUser.subscriptionPlan = { subscription: 'Unlimited' };
      await User.replaceOne({ _id: newUser._id }, newUser);
    }));
    console.log('5');

    places = await Place.find({}).toArray();

    await Promise.all(places.map(async (place) => {
      place.access = 'basic';
      await Place.replaceOne({ _id: place._id }, place);
    }));
    console.log('6');

    await Booking.updateMany({date: '10-03-2019'}, {$set: {closed: false}});
    console.log('7');

    return res.send('done');
  });

  app.get('/api/revert-migrate', async (req, res) => {
    await Offer.updateMany({}, { $unset: { isActive: '' } });
    await Offer.updateMany({}, { $unset: { scopes: '' } });

    await Place.updateMany({ }, { $unset: { allows: '' } });
    await Place.updateMany({ }, { $unset: { city: '' } });
    await Place.updateMany({ }, { $unset: { requirements: '' } });

    await Offer.updateMany({}, { $unset: { isActive: '' } });
    await Offer.updateMany({}, { $unset: { scopes: '' } });

    await Booking.updateMany({}, { $unset: { eventId: '' } });

    await Promise.all(a.map(async (el) => {
      el.creationDate = moment(el.creationDate).format('DD-MM-YYYY');
      await Booking.replaceOne({ _id: el._id }, el);
    }));

    await User.updateMany({}, { $unset: { subscription: '' }});
    await Place.updateMany({}, { $unset: { access: '' }});
  });
}
