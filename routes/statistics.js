const moment = require('moment');

module.exports = (app, User, Place, Offer, Counter, Booking, OfferPost, Interval) => {

  //// ADMINS
  //// SECTION

  // Get the statistics for the Wallet section in Admins page
  app.get('/api/statistics/wallet', function (req, res) {
    OfferPost.find({ accepted: true }).toArray(function (err, posts) {
      var counts = { instaPost: 0, instaStories: 0, fbPost: 0, tripAdvisorPost: 0, googlePlacesPost: 0 };
      var credits = 0;
      posts.forEach(function (post) {
        if (post.type in counts) counts[post.type]++;
        credits += post.credits;
      });
      res.json({counts: counts, creditsGiven: credits});
    });
  });

  // Get the data for the growth chart for the whole time
  app.get('/api/statistics/charts/myChart', async function (req, res) {
    var posts = await OfferPost.aggregate([{
      $group: {_id: '$place', type: { $push: '$type' }}
    }]).toArray();
    await chartDataSort(posts, res);
  });

  // Get the data for the growth chart for today
  app.get('/api/statistics/charts/myChart/today', async function (req, res) {
    var today = moment().format('DD-MM-YYYY');
    var posts = await OfferPost.aggregate([{
      $match: { creationDate: today }
    }, {
      $group: { _id: '$place', type: { $push: '$type' }}
    }]).toArray();

    await chartDataSort(posts, res);
  });

  // Get the data for the growth chart for the month
  app.get('/api/statistics/charts/myChart/month', async function (req, res) {
    var month = moment().format('-MM-');
    var posts = await OfferPost.aggregate([{
      $match: {
        creationDate: { $regex: month }
      }
    }, {
      $group: { _id: '$place', type: { $push: '$type' }}
    }]).toArray();

    await chartDataSort(posts, res);
  });

  async function chartDataSort(posts, res) {
    var full = await Promise.all(posts.map(async function (post) {
      var place = await Place.findOne({ _id: post._id}, { projection: { name: 1 }});
      post.place = place.name;
      var counts = { instaPost: 0, instaStories: 0, fbPost: 0, tripAdvisorPost: 0, googlePlacesPost: 0 };
      post.type.forEach(function (type) {
        if (type in counts) counts[type]++;
      });
      post.counts = counts;
      post.type = null;
      return post;
    }));

    res.json(full);
  }

  // Get the models ranking in the overview section
  app.get('/api/statistics/overview/ranking', async function (req, res) {
    var posts = await OfferPost.aggregate([{
      $group: { _id: '$user', type: { $push: '$type' }}
    }]).toArray();

    await rankingSort(posts, res);
  });
  // Get the TODAY's models ranking in the overview section
  app.get('/api/statistics/overview/ranking/today', async function (req, res) {
    var today = moment().format('DD-MM-YYYY');

    var posts = await OfferPost.aggregate([{ $match: { creationDate: today }}, {
      $group: { _id: '$user', type: { $push: '$type' }}
    }]).toArray();

    await rankingSort(posts, res);
  });
  // Get the MONTH's models ranking in the overview section
  app.get('/api/statistics/overview/ranking/month', async function (req, res) {
    var month = moment().format('-MM-');
    var posts = await OfferPost.aggregate([{ $match: { creationDate: { $regex: month } }}, {
      $group: { _id: '$user', type: { $push: '$type' }}
    }]).toArray();

    await rankingSort(posts, res);
  });

  async function rankingSort(posts, res) {
    var full = await Promise.all(posts.map(async function (post) {
      post.user = await User.findOne({ _id: post._id }, { projection: { name: 1, surname: 1, credits: 1, photo: 1 }});

      var stories = 0;
      var postsnum = post.type.length;
      post.type.forEach(function (type) {
        if (type === 'instaStories') {
          stories++;
          postsnum--;
        }
      });
      post.stories = stories;
      post.posts = postsnum;
      post.type = null;
      return post;
    }));

    res.json(full);
  }


  // Get statistics in numbers for some type of post
  app.get('/api/statistics/res/:id/reviews/:type', function (req, res) {
    OfferPost.find({ type: req.params.type, accepted: true, place: parseInt(req.params.id) }).toArray(function (err, posts) {
      var totalNum = posts.length;
      var average = 0;
      var lastweek = 0;
      posts.forEach(function (post) {
        average += post.stars;
        var diff = moment().diff(moment(post.creationDate, 'DD-MM-YYYY'), 'days');
        if(diff > 0 && diff < 7) lastweek++;
      });
      average = average / totalNum;
      res.json({ totalNum: totalNum, average: average, lastweek: lastweek })
    });
  });

  // Get the restaurant ranking in the overview section
  app.get('/api/statistics/overview/resRanking', async function (req, res) {

    var rest = await Place.find({'posts.0': { $exists: true }}, {
      projection: { bookings: 1, posts: 1, name: 1, photos: 1 }
    }).toArray();

    res.json(rest);
  });
  // Get the TODAY's restaurant ranking in the overview section
  app.get('/api/statistics/overview/resRanking/today', async function (req, res) {
    var today = moment().format('DD-MM-YYYY');

    var places = await OfferPost.aggregate([{ $match: { creationDate: today }}, {
      $group: { _id: '$place' }}]).toArray();
    if(places.length !== 0) {
      var pl = [];
      for(var id of places) pl.push(id._id);
      var rest = await Place.find({ _id: { $in: pl }}, {
        projection: { bookings: 1, posts: 1, name: 1, photos: 1 }
      }).toArray();
      res.json(rest);
    } else {
      res.json([]);
    }
  });
  // Get the MONTH's restaurant ranking in the overview section
  app.get('/api/statistics/overview/resRanking/month', async function (req, res) {
    var month = moment().format('-MM-');

    var places = await OfferPost.aggregate([{ $match: { creationDate: { $regex: month } }}, {
      $group: { _id: '$place' }}]).toArray();
    if(places.length !== 0) {
      var pl = [];
      for(var id of places) pl.push(id._id);
      var rest = await Place.find({ _id: { $in: pl }}, {
        projection: { bookings: 1, posts: 1, name: 1, photos: 1 }
      }).toArray();
      res.json(rest);
    } else {
      res.json([]);
    }
  });

  // Get the data for the chart on the Admins page
  app.get('/api/statistics/charts/growth', async function (req, res) {
    var users = await User.aggregate([{
      $match: {'creationDate': {$exists: true}}
    }, {
      $group: {
        _id: { $substr: ['$creationDate', 3, 2] },
        amount: {$sum: 1}
      }
    }]).toArray();
    res.json(users);
  });

  // The data for the content Daily record section of Admins page
  app.get('/api/statistics/content/daily', async function (req, res) {
    var posts = await OfferPost.aggregate([{
      $match: { accepted: false }
    }, {
      $group: {
        _id: { user: '$user', place: '$place' },
        post: { $push: { _id: '$_id', link: '$link', stars: '$stars', feedback: '$feedback', credits: '$credits', type: '$type' }}
      }
    }, {
      $group: {
        _id: '$_id.place',
        users: { $push: { id: '$_id.user', posts: '$post' } }
      }
    }]).toArray();
    var full = [];
    await Promise.all(posts.map(async function (place) {
      var counts = { instaPost: 0, instaStories: 0, fbPost: 0, tripAdvisorPost: 0, googlePlacesPost: 0 };
      place.users.forEach(async function (user) {
        user.id = await User.findOne({ _id: user.id }, { projection: { photo: 1, name: 1, surname: 1 }});
        user.posts.forEach(function (post) {
          if (post.type in counts) counts[post.type]++;
        });
      });
      place._id = await Place.findOne({ _id: place._id }, { projection: { photos: 1, credits: 1 }});
      place.counts = counts;
      full.push(place);
    }));
    res.json(full);
  });

  // The data for the content Full record section of Admins page
  app.get('/api/statistics/content/full', function (req, res) {
    OfferPost.find({ accepted: true }).toArray(async function (err, posts) {
      var full = await Promise.all(posts.map(async function (post) {
        post.user = await User.findOne({_id: post.user}, {projection: {name: 1, surname: 1, photo: 1}});
        return post;
      }));
      res.json(full);
    });
  });

  //// RESTAURANT
  //// SECTION

  app.get('/api/statistics/res/:id/content/today', function (req, res) {
    var today = moment().format('DD-MM-YYYY');
    var id = parseInt(req.params.id);
    if(!id) {
      res.json({ message: "No such place" });
    } else {
      OfferPost.find({ place: id, creationDate: today }).toArray(async function (err, posts) {
        var full = await Promise.all(posts.map(async function (post) {
          post.user = await User.findOne({ _id: post.user }, { projection: { name: 1, surname: 1, photo: 1 }});
          return post;
        }));
        res.json(full);
      });
    }
  });

  app.get('/api/statistics/res/:id/content', function (req, res) {
    var date = moment(req.query.date, 'DD-MM-YYYY').format('DD-MM-YYYY');
    var id = parseInt(req.params.id);
    if(!id) {
      res.json({ message: "No such place" });
    } else {
      OfferPost.find({ place: id, creationDate: date }).toArray(async function (err, posts) {
        var full = await Promise.all(posts.map(async function (post) {
          post.user = await User.findOne({ _id: post.user }, { projection: { name: 1, surname: 1, photo: 1 }});
          return post;
        }));
        res.json(full);
      });
    }
  });

  // The statistics for the Res: wallet section. Counts posts and credits
  app.get('/api/statistics/res/:id/wallet', async function (req, res) {
    // var id = parseInt(req.params.id);
    // $match: { accepted: true, place: id }
    var posts = await OfferPost.aggregate([{
      $match: { accepted: true }
    }, {
      $group: {
        _id: '$type',
        times: { $sum: 1 },
        credits: { $sum: '$credits' }
      }
    }]).toArray();
    res.json(posts);
  });

  // Count visitors of some place by days
  app.get('/api/statistics/res/:id/overview/visitors', async function (req, res) {
    var id = parseInt(req.params.id);
    var format = 'DD-MM-YYYY';
    var weekArr = [moment().subtract(6,'days').format(format),
      moment().subtract(5,'days').format(format), moment().subtract(4,'days').format(format),
      moment().subtract(3,'days').format(format), moment().subtract(2,'days').format(format),
      moment().subtract(1,'days').format(format), moment().format(format)];

    var intervals = await Interval.findOne({ place: id });
    var visitors = await Booking.aggregate([{
      $match: { place: id, $expr: { $in: ['$date', weekArr] }}
    }, {
      $group: {
        _id: { start: '$startTime', date: '$date' },
        book: { $push: { start: '$startTime', end: '$endTime',  }}
      }
    }, {
      $group: {
        _id: '$_id.date',
        users: { $push: { book: '$book' } }
      }
    }]).toArray();

    visitors.forEach(function (day) {
      day._id = moment(day._id, format).format('dddd');
      day.users = day.users.map(function (user) {
        var userNum = user.book.length;
        var time = user.book[0];
        return { start: time.start, end: time.end, amount: userNum };
      });
    });

    res.json({ visitors: visitors, intervals: intervals });
  });

  // The statistics for the Res: overview section OFFERS subsection
  app.get('/api/statistics/res/:id/overview/offers', async function (req, res) {
    var id = parseInt(req.params.id);
    var offers = await Offer.find({ place: id, closed: true }, { projection: { credits: 0, closed: 0, post: 0 }}).toArray();
    var full = await Promise.all(offers.map(async function (offer) {
      offer.user = await User.findOne({ _id: offer.user }, { projection: { name: 1, surname: 1, photo: 1, level: 1 }});
      return offer;
    }));
    res.json(full);
  });

  async function loadReviews(query, res){
    var posts = await OfferPost.aggregate([{
      $match: query
    }, {
      $group: {
        _id: '$user',
        posts: { $sum: 1 },
        stories: { $sum: { $cond: [ { $eq: [ '$type', 'instaStories' ] }, 1, 0 ]}},
        credits: { $sum: '$credits'}
      }
    }]).toArray();
    var full = await Promise.all(posts.map(async function (user) {
      user._id = await User.findOne({ _id: user._id }, { projection: { name: 1, surname: 1, photo: 1 }});
      return user;
    }));
    res.json(full);
  }
  // The statistics for the Res: overview section REVIEWS subsection for all Time
  app.get('/api/statistics/res/:id/overview/reviews/year', async function (req, res) {
    var id = parseInt(req.params.id);
    var query = { 'place': id };
    await loadReviews(query, res);
  });

  // The statistics for the Res: overview section REVIEWS subsection for one day - today
  app.get('/api/statistics/res/:id/overview/reviews/today', async function (req, res) {
    var id = parseInt(req.params.id);
    var today = moment().format('DD-MM-YYYY');
    var query = { 'place': id, 'creationDate': today };
    await loadReviews(query, res);
  });

  // The statistics for the Res: overview section REVIEWS subsection for the current month
  app.get('/api/statistics/res/:id/overview/reviews/month', async function (req, res) {
    var id = parseInt(req.params.id);
    var month = moment().format('-MM-');
    var query = { 'place': id, 'creationDate': { '$regex': month } };
    await loadReviews(query, res);
  });


  // The statistics for the Res: overview section RESTAURANT CONTENT subsection for one day - today
  app.get('/api/statistics/res/:id/overview/content/today', async function (req, res) {
    var id = parseInt(req.params.id);
    var today = moment().format('DD-MM-YYYY');

    var place = await Place.findOne({ _id: id }, { projection: { photos: 1, name: 1, credits: 1}});
    place.posts = await OfferPost.countDocuments({ place: id, creationDate: today });
    place.visitors = await Booking.countDocuments({ place: id, date: today });
    res.json(place);
  });

  // The statistics for the Res: overview section RESTAURANT CONTENT subsection for one month
  app.get('/api/statistics/res/:id/overview/content/month', async function (req, res) {
    var id = parseInt(req.params.id);
    var month = moment().format('-MM-');

    var place = await Place.findOne({ _id: id }, { projection: { photos: 1, name: 1, credits: 1}});
    place.posts = await OfferPost.countDocuments({ place: id, creationDate: { $regex: month } });
    place.visitors = await Booking.countDocuments({ place: id, date: { $regex: month } });
    res.json(place);
  });

  // The statistics for the Res: overview section RESTAURANT CONTENT subsection for the whole time
  app.get('/api/statistics/res/:id/overview/content/year', async function (req, res) {
    var id = parseInt(req.params.id);

    var place = await Place.findOne({ _id: id }, { projection: { photos: 1, name: 1, credits: 1}});
    place.posts = await OfferPost.countDocuments({ place: id });
    place.visitors = await Booking.countDocuments({ place: id });
    res.json(place);
  });

  app.get('/api/statistics/metrics', async (req, res, next) => {
    try {
      let days = parseInt(req.query.days);

      const query = {};
      if (isNaN(days)) {
        days = 30;
      } else {
        query.days = days;
      }
  
      const since = moment().subtract({ days }).toISOString();
  
      const totalBookings = await Booking.countDocuments({ creationDate: { $gte: since } });
      const totalActions = await OfferPost.countDocuments({ creationDate: { $gte: since } });
      const newUsers = await User
        .find({ creationDate: { $gte: since } })
        .sort({ creationDate: 1 })
        .limit(5)
        .toArray();

      return res.json({
        totalBookings,
        totalActions,
        totalContents: 10,
        wallet: 250000,
        newUsers,
      });
    } catch (err) {
      return next(err);
    }
  });
};
