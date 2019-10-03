const _ = require('lodash');
const moment = require('moment');

module.exports = (app, User, Place, Offer, Counter, Booking, OfferPost, Interval, SamplePost) => {
  app.get('/api/migrate', async (req, res) => {
    console.log('1');
    await Offer.updateMany({}, { $set: { isActive: true } });
    console.log('2');
    await Offer.updateMany({}, { $set: { scopes: ['regular'] } });
    console.log('3');

    await Place.updateMany({ }, { $set: { allows: ['male', 'female']} });
    console.log('4');
    await Place.updateMany({ }, { $set: { city: 'Milan' } });
    console.log('5');
    await Place.updateMany({ }, { $set: { requirements: {} } });
    console.log('6');

    await Offer.updateMany({}, { $set: { isActive: true } });
    console.log('7');
    await Offer.updateMany({}, { $set: { scopes: ['regular'] } });
    console.log('8');

    let a, ps, users, places;
    a = await Booking.find({}).toArray();
    console.log('9');

    ps = await Promise.all(a.map(async (el) => {
      await Booking.replaceOne({ _id: el._id }, { ...el, eventId: null });
    }));
    console.log('10');
    
    a = await Booking.find({}).toArray();
    console.log('11');

    ps = await Promise.all(a.map(async (el) => {
      try {
        const parts = el.creationDate.split("-");
        el.creationDate = moment(new Date(parts[2], parts[1] - 1, parts[0])).add({days:1}).subtract({hours:22}).toISOString();
        await Booking.replaceOne({ _id: el._id }, el);
      } catch (err) {}
    }));
    console.log('12');

    users = await User.find({}).toArray();
    console.log('13');

    await Promise.all(users.map(async (newUser) => {
      newUser.subscriptionPlan = { subscription: 'Unlimited' };
      await User.replaceOne({ _id: newUser._id }, newUser);
    }));
    console.log('14');

    places = await Place.find({}).toArray();
    console.log('15');

    await Promise.all(places.map(async (place) => {
      place.access = 'basic';
      await Place.replaceOne({ _id: place._id }, place);
    }));
    console.log('16');

    await Booking.updateMany({date: '10-03-2019'}, {$set: {closed: false}});

    return res.send('done');
  });

  app.get('/api/revert-migrate', async (req, res) => {
    await Offer.updateMany({}, { $unset: { isActive: '' } });
    console.log('1');
    await Offer.updateMany({}, { $unset: { scopes: '' } });
    console.log('2');

    await Place.updateMany({ }, { $unset: { allows: '' } });
    console.log('3');
    await Place.updateMany({ }, { $unset: { city: '' } });
    console.log('4');
    await Place.updateMany({ }, { $unset: { requirements: '' } });
    console.log('5');

    await Offer.updateMany({}, { $unset: { isActive: '' } });
    console.log('6');
    await Offer.updateMany({}, { $unset: { scopes: '' } });
    console.log('7');

    await Booking.updateMany({}, { $unset: { eventId: '' } });
    console.log('8');

    await Promise.all(a.map(async (el) => {
      el.creationDate = moment(el.creationDate).format('DD-MM-YYYY');
      await Booking.replaceOne({ _id: el._id }, el);
    }));
    console.log('9');

    await User.updateMany({}, { $unset: { subscription: '' }});
    console.log('10');
    await Place.updateMany({}, { $unset: { access: '' }});

    return res.send('ok');
  });
}
