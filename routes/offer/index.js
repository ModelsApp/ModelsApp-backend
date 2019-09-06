const _ = require('lodash');

var db = require('../../config/connection');
var middleware = require('../../config/authMiddleware');
var moment = require('moment');
var imageUplader = require('../../lib/imageUplader');
var multiparty = require('multiparty');
var pushProvider = require('../../lib/pushProvider');
var dfs = require('obj-traverse/lib/obj-traverse');
var entityHelper = require('../../lib/entityHelper');
const calculateActionPoints = require('../actionPoints/calculator/action');
const postOfferSchema = require('./schema/postOffer');
const ErrorResponse = require('./../../core/errorResponse');
const { OFFER_SCOPES } = require('./constant');

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

module.exports = function(app, actionPointsRepository, userRepository, offerRepository, validate) {

  /* Migrate offers, add isActive:true field to all */
  /*
  app.get('/api/offer/migrate', async (req, res) => {
    await Offer.updateMany({}, { $set: { isActive: true } });
    res.send(await Offer.find({}).toArray());
  });
  */

  // app.get('/api/offer/migrate', function (req, res) {
  //   OfferPost.deleteMany({_id: {$in: [12,13,38,39,40,41,42,43,44,45,46,47,48,49,50,51]}});
  //   res.send('mutated');
  // });

  /* Migrate offers, add scopes field to all */
  /*
  app.get('/api/offer/migrate', async (req, res) => {
    await Offer.updateMany({}, { $set: { scopes: ['regular'] } });
    res.send(await Offer.find({}).toArray());
  });
  */

  // Offers section
  // ______________________________

  // Get specific Offer
  app.get('/api/place/offer/:id', function (req, res) {
    var id = parseInt(req.params.id);

    Offer.findOne({_id: id, isActive: true}, async function (err, offer) {
      if (!offer) {
        res.json({message: "No such offer"});
      } else {
        if (req.query.userID) {
          var user = parseInt(req.query.userID);
          offer.posts = await OfferPost.find({user: user, offer: offer._id}).toArray();
        }
        offer.place = await Place.findOne({_id: offer.place}, {projection: {socials: 1}});
        if(offer.place.socials.instagram) {
          var insta = offer.place.socials.instagram;
          var regexp = insta.match(/instagram.com\/(.*)\/?\??/i);
          offer.instaUser = regexp[1];
        } else {
          offer.instaUser = "";
        }
        res.json(offer);
      }
    });
  });

  //Get all offers belonging to specified place
  app.get('/api/place/:id/offer', function (req, res) {
    var id = parseInt(req.params.id);
    const query = { place: id, isActive: true };
    const { scopes } = req.query;
    if (scopes) {
      query.scopes = scopes;
    }
    Offer.find(query).toArray(function (err, offers) {
      res.json(offers);
    });
  });
  app.get('/api/place/:id/bookingOffers', (req,res) => {
    var id = parseInt(req.params.id);
    var start = req.body.start;
    var end = req.body.end;

    Offer.find({ place: id, start: start, end: end, isActive: true, }).toArray(function (err, offers) {
      res.json(offers);
    });
  });
  app.get('/api/v2/offer/:id/booking/:bookingId/actions', middleware.isAuthorized, async (req, res) => {
    const user = await req.user;
    const offerId = parseInt(req.params.id);
    const bookingId = parseInt(req.params.bookingId);

    if (!(offerId && bookingId)) {
      return res.status(400).json({message: "invalid parameters"});
    }

    const offer = await Offer.findOne({ _id: offerId, isActive: true });
    const booking = await Booking.findOne({ _id: bookingId });

    if (!(offer && booking)) {
      return res.status(404).json({message: "offer or booking not found"});
    }

    const { actions: offerActions } = booking;

    if (offerActions) {
      const filteredOfferActions = offerActions.filter(offerAction => offerAction.offerId === offerId); 
      if (filteredOfferActions.length) {
        return res.status(200).json(filteredOfferActions[0].actions);
      }
    }

    const offerAction = {
      offerId,
      actions: await generateActions(offer, user.level),
    };
    await Booking.findOneAndUpdate({ _id: bookingId }, { $push : { actions: offerAction }});
    return res.status(200).json(offerAction.actions);
  });

  app.get('/api/offer/:id/booking/:bookingId/actions', middleware.isAuthorized, async (req, res) => {
    const offerId = parseInt(req.params.id);
    const bookingId = parseInt(req.params.bookingId);
    const user = await req.user;

    if (offerId && bookingId) {
      await Offer.findOne({ _id: offerId, isActive: true })
        .then(async (offer) => {
          if (!offer) res.status(404).json({ message: "offer not found" });
          await Booking.findOne({ _id: bookingId })
            .then(async (booking) => {
              if (!booking) res.status(404).json({ message: "booking not found" });
                const { offerActions } = booking;
                //check if user arleady go to choose action for particular offer
                const filteredOfferActions = offerActions.filter(offerAction => offerAction.offerId == offerId);
                if (filteredOfferActions.length > 0) {
                  res.status(200).json(filteredOfferActions[0].actions);
                } else {
                  //first apperence we need to create available actions
                  const offerAction = {
                    offerId: offerId,
                    actions: await generateActions(offer, user.level),
                  };
                 await Booking.findOneAndUpdate({_id: bookingId}, { $push : { offerActions: offerAction }})
                    .then(()=>{
                    res.status(200).json(offerAction.actions);
                  })
                  .catch(err =>{
                    res.status(500).json({ message: err });
                  });
                }
            })
            .catch(err => {
              res.status(404).json({ message: err.message });
            });
        })
        .catch(err => {
          res.status(404).json({ message: err.message });
        });

    }else{
      res.status(400).json({ message: "invalid parameters" });
    }
  });
  function getAvailableActionTypes(){
    var availableTypes = { 
      'instaStories' : 'Instagram story',
      'instaPost': 'Instagram post',
      'fbPost': 'Facebook post',
      'tripAdvisorPost': 'Tripadvisor',
      'yelpPost': 'Yelp review',
      'gPost': 'Google post'
    }
    return availableTypes;
  }

  async function generateActions(offer, userLevel) {
    const { credits } = offer;
    const actionPointsProviders = await actionPointsRepository.find();
    const offerCreditsArray = Array.from(Object.keys(credits));

    return offerCreditsArray.map(x => {
      const actionPoints = actionPointsProviders.find(ap => ap.provider === x);
      return {
        displayName: getAvailableActionTypes()[x],
        type: x,
        credits: actionPoints ? calculateActionPoints(actionPoints.points, userLevel, offer.level) : null,
        active: true,
      };
    });
  }

  app.get('/api/offer/:id/actions', middleware.isAuthorized, async (req, res) => {
    const user = await req.user;
    const id = parseInt(req.params.id);

      Offer.findOne({_id: id, isActive: true}).then(async (offer) => {
        const actions = await generateActions(offer, user.level);
        res.json(actions);
      })
      .catch(err => {
        console.log(err);
        res.status(500).json({ message: 'err' });
      });
    });

  // Create the offer. Then wait for the post, admin's check of the post, and then close it
  app.post('/api/place/:id/offer', async (req, res) => {
    const validation = validate(req.body, postOfferSchema);
    if (validation.error) {
      return res.status(400).json({ message: validation.error });
    }

    const id = parseInt(req.params.id);
    const {
      name,
      userID,
      composition,
      price,
      timeframes,
      photo,
      level,
      credits,
      scopes,
    } = req.body;
    const offer = {
      name,
      place: id,
      user: parseInt(userID),
      price: parseInt(price),
      creationDate: moment().format('DD-MM-YYYY'),
      composition,
      photo,
      post: null,
      closed: false,
      scopes: scopes || [OFFER_SCOPES.regular],
      level: parseInt(level || 1),
      images: [],
      mainImage: null,
      timeframes,
      credits: _.pickBy(credits, v => v),
      isActive: true,
    };

    User.findOne({ _id: offer.user }, { projection: { name: 1 }}, (err, user) => {
      if (!user) {
        res.status(404).json({ message: 'No such user' });
      } else {
          Counter.findOneAndUpdate(
            { _id: 'offerid' },
            { $inc: {seq: 1} },
            { new: true },
            (err, seq) => {
              if (err) console.error(err);
              offer._id = seq.value.seq;

              Place.findOneAndUpdate({ _id: id }, { $push: { offers: seq.value.seq } }, async (err, place) => {
                if (!place.value) {
                  res.status(404).json({ message: 'No such place' });
                } else {
                  await User.findOneAndUpdate({ _id: offer.user }, { $push: { offers: seq.value.seq } });
                  await Offer.insertOne(offer);
                    
                  await User.find({ accepted : true }).toArray(async (err, users) => {
                    await OfferPost.distinct('user', { place: place.value._id }).then(async (posts) => {
                        let devices = [];
                        for (post of posts){
                          const user = users.find(u => u._id == post);
                          if (user) devices.push(user.devices);
                        }
                        if (devices.length){
                          devices = devices.reduce((a,b) => a.concat(b));
                          await pushProvider.sendNewOfferNotification(devices, offer, place.value);
                        }
                      });
                    });

                  res.status(201).json({ message: 'Offer created' });
                }
              });
            }
          );
      }
    });
  });

  // Deletes the offer document and all links to it
  app.delete('/api/place/offer/:id', function (req, res) {
    var id = parseInt(req.params.id);
    Offer.findOne({_id: id}, function (err, offer) {
      if (!offer) {
        res.json({message: "No such offer"});
      } else {
        Place.findOneAndUpdate({_id: parseInt(offer.place)}, {$pull: {offers: id}}, function (err, updated) {
          if (!updated.value) {
            res.json({message: "Could not be deleted"});
          } else {
            Offer.deleteOne({_id: id}, function (err, deleted) {
              if (deleted.deletedCount === 1) {
                res.json({message: "Deleted"});
              } else {
                res.json({message: "Not deleted"});
              }
            });
          }
        });
      }
    });
  });


  // Posts section
  // ____________________________

  // Get the app know if the User created a post to pay for the offer

  app.post('/api/place/:id/post/sample', function (req, res) {
    if (req.body.feedback) {
      var samplePost = {};
      samplePost.feedback = req.body.feedback;
      samplePost.place = parseInt(req.params.id);
      samplePost.updatedTime = moment().format('DD-MM-YYYY');
      samplePost.users = [];

      SamplePost.findOne({place: samplePost.place, feedback: samplePost.feedback}, function (err, post) {
        if (post) {
          res.json({message: "The sample of the post with this review already exist"});
        } else {
          Counter.findOneAndUpdate({_id: "samplepostid"}, {$inc: {seq: 1}}, {new: true}, function (err, seq) {
            if (err) console.log(err);
            samplePost._id = seq.value.seq;
            SamplePost.insertOne(samplePost);
            res.json({message: "Successfully added"});
          });
        }
      });
    }
  });

  function randomInteger(min, max) {
    var rand = min - 0.5 + Math.random() * (max - min + 1);
    rand = Math.round(rand);
    return rand;
  }

  // Get all post samples by placeID and Action
  app.get('/api/place/:id/sample', middleware.isAuthorized, async function (req, res) {
    var id = parseInt(req.params.id);

    var checkSample = await SamplePost.findOne({});
    if(checkSample.updatedDate !== moment().format('DD-MM-YYYY')) {
      SamplePost.updateMany({}, { $set: { updatedDate: moment().format('DD-MM-YYYY'), users: [] }});
    }

    var user = await req.user;
    SamplePost.find({place: id, users: {$not: {$elemMatch: {$eq: user._id}}}}).toArray(async function (err, posts) {
      if (posts.length !== 0) {
        var post = await posts[randomInteger(0, posts.length - 1)];
        SamplePost.findOneAndUpdate({_id: post._id}, {$push: {users: user._id}});
        res.json({message: post.feedback});
      } else {
        res.json({message: "No samples for you"});
      }
    });
  });

  app.post('/api/place/offer/:id/post', middleware.isAuthorized, async (req, res) => {
    const u = await req.user;
    const { postType } = req.body;
    let offer;
    try {
      offer = await offerRepository.findOne(parseInt(req.params.id));
    } catch (error) {
      return res.send(500).json({ message: 'Internal server error' });
    }
    if (!offer) {
      return res.send(404).json({ message: `Couldnt find offer for id ${req.params.id}`});
    }

    if (!postType || !req.body.link || !req.body.feedback) {
      return res.status(400).json({ message: 'Not all fields are provided' });
    }

    let actionPoints;
    try {
      actionPoints = await actionPointsRepository.findOne(postType);
    } catch (error) {
      return res.status(500).json({ message: 'Internal server error' });
    }

    if (!offer.credits[postType] || !actionPoints) {
      return res.status(400).json({ message: 'This Post type is unsupported' });
    }

    const offerPost = {
      type: postType,
      credits: calculateActionPoints(actionPoints.points, u.level, offer.level),
      offer: parseInt(req.params.id),
      stars: parseInt(req.body.stars) || 0,
      creationDate: moment().format('DD-MM-YYYY'),
      link: req.body.link,
      feedback: req.body.feedback,
      place: offer.place,
      accepted: false,
      user: req.user._id,
    };

    Counter.findOneAndUpdate(
      {_id: 'offerpostid'},
      {$inc: {seq: 1}},
      {new: true},
      function (err, seq) {
        if (err) console.log(err);
        offerPost._id = seq.value.seq;

        OfferPost.insertOne(offerPost);

        Offer.findOneAndUpdate({ _id: offerPost.offer, isActive: true }, { $set: {post: seq.value.seq } }, async (err, offer) => {
          if (err) {
            return res.status(500).json({ message: 'Internal server error' });
          }
          try {
            if (!offer.value) {
              return res.status(404).json({ message: 'No such offer' });
            }
            await Place.findOneAndUpdate({ _id: offer.value.place }, { $push: { posts: seq.value.seq } });
            const updatedUser = await userRepository
              .findOneAndUpdateAction(offerPost.user, postType, { $push: { offerPosts: seq.value.seq } });
            if (!updatedUser) {
              return res.status(404).json({ message: 'User not found' });
            }
            return res.status(201).json({ message: 'Offer post created' });
          } catch (error) {
            return res.status(500).json({ message: 'Internal server error' });
          }
        });
      },
    );
  });


  getBookingAction = async (actionId, actions) => {
    let foundBookingAction
    for(let action of actions){
      let found =  dfs.findFirst(action, 'subActions', {id: actionId});
      if(found){
        foundBookingAction = found;
      } 
    }
    return foundBookingAction;
  }

  app.post('/api/v2/offer/:id/booking/:bookingId/post', middleware.isAuthorized, async (req, res) => {
    let bookingId = parseInt(req.params.bookingId);
    let offerId = parseInt(req.params.id);
    let user = await req.user;

    if(bookingId & offerId){
      let offer = await Offer.findOne({ _id: offerId, isActive: true });
      let booking = await Booking.findOne({ _id: bookingId });
      if(offer && booking){
        var form = new multiparty.Form();
        await form.parse(req, async function (err, fields, files) {
          let actionId, dbOfferPost, bookingAction, foundBookingAction;
          try {
            actionId = fields.actionId[0];
            dbOfferPost = await OfferPost.findOne({offer: offerId, booking: bookingId, actionId: actionId});
            bookingAction = booking.actions.filter(x=>x.offerId == offer._id)[0];
          } catch (err) {
            return res.status(500).json({ message: 'Internal server error' });
          }
          if(bookingAction){
            foundBookingAction = await getBookingAction(actionId, bookingAction.actions);
            if(foundBookingAction && ( !dbOfferPost || foundBookingAction.maxAttempts - foundBookingAction.attempts > 0)){
              foundBookingAction.attempts = foundBookingAction.attempts + 1;
              if(!foundBookingAction.isPictureRequired || (foundBookingAction.isPictureRequired && files && files.images && files.images.length > 0)){
                try {
                  let id = await entityHelper.getNewId('offerpostid')
                  const bookingAct = foundBookingAction.parentId ? (await getBookingAction(foundBookingAction.parentId, bookingAction.actions)) : foundBookingAction;
                  const actionPoints = await actionPointsRepository.findOne(bookingAct.type);
                  if (!actionPoints) {
                    return res.status(400).json({ message: 'Unsupported action type' });
                  }
                  const postOffer = {
                    _id: id,
                    type: foundBookingAction.type,
                    credits: calculateActionPoints(actionPoints.points, user.level, offer.level),
                    offer: offer._id,
                    stars: fields.star ? fields.star[0] : 0,
                    creationDate: moment().format('DD-MM-YYYY'),
                    link: fields.link ? fields.link[0] : null,
                    feedback: fields.feedback ? fields.feedback[0] : null,
                    place: offer.place,
                    accepted: false,
                    user: user._id,
                    booking: booking._id,
                    actionId: actionId,
                    image: files.images.length && foundBookingAction.isPictureRequired > 0 ?  await imageUplader.uploadImage(files.images[0].path, 'postOffer', offer._id) : null
                  };
                  foundBookingAction.isActive = foundBookingAction.maxAttempts - foundBookingAction.attempts > 0;
                  await OfferPost.insertOne(postOffer);
                  await Place.findOneAndUpdate({_id: offer.place}, { $push: { posts: id }});
                  await Booking.findOneAndUpdate(
                    { _id : booking._id },
                    { $pull : { actions: { offerId: offer._id  } } });
                  await Booking.findOneAndUpdate(
                    { _id : booking._id },
                    { $push: { actions : bookingAction }});
  
                  await userRepository
                    .findOneAndUpdateAction(
                      postOffer.user,
                      bookingAct.type,
                      {
                        $push: {
                          offerPosts: id,
                          offerPostsV2: { id: id, createdAt: moment().format('DD-MM-YYYY HH:mm:ss') },
                        },
                      });
                  return res.status(200).json({ message: 'Offer post created' });
                } catch (error) {
                  return res.status(500).json({ message: 'Internal server error' });
                }
              }else{
                res.status(400).json({message: "Not all fields are provided"});
              }
            }else{
              res.status(400).json({message: "Cannot create actions"});
            }
          }else{
            res.status(400).json({message: "Cannot create actions"});
          }
        });
      }else{
        res.status(400).json({message: "Booking or offer not found"});
      }
    }else{
      res.status(400).json({message: "invalid parameters"});
    }
  });

app.post('/api/offer/:id/booking/:bookingId/post', middleware.isAuthorized, async (req, res) => {
  const u = await req.user;
  const bookingId = parseInt(req.params.bookingId);

  //todo should be removed after ios update
  if(req.body.postType && req.body.postType == 'google'){
    req.body.postType = req.body.postType.replace('google', 'gPost');
  }
  OfferPost.findOne({ offer: parseInt(req.params.id), booking: bookingId, type: req.body.postType }, function(err, dbOfferPost){
    if (dbOfferPost) {
      res.status(400).json({message: "You arleady done this action"});
    } else {

    Offer.findOne({_id: parseInt(req.params.id), isActive: true}, function (err, offer) {
      if (!offer) {
        res.json({message: "No such offer"});
      } else {
        Booking.findOne({_id: bookingId}, async (err, booking) => {
          if(!booking){
            res.status(404).json({message: "No such booking"});
          } else {
            if (!req.body.postType || !req.body.link || (req.body.postType != 'instaStories' && req.body.postType != 'instaPost'  && !req.body.feedback)) {
              res.json({message: "Not all fields are provided"});
            } else {
              if (!offer.credits[req.body.postType]) {
                res.json({message: "This Post type is unsupported"});
              } else {
                try {
                  actionPoints = await actionPointsRepository.findOne(req.body.postType);
                } catch (err) {
                  res.status(500).json({ message: 'Internal server error' });
                }
                if (!actionPoints) {
                  res.status(400).json({ message: 'Unsupported action type' });
                } else {
                  const offerPost = {
                    type: req.body.postType,
                    credits: calculateActionPoints(actionPoints.points, u.level, offer.level),
                    offer: parseInt(req.params.id),
                    stars: parseInt(req.body.stars) || 0,
                    creationDate: moment().format('DD-MM-YYYY'),
                    link: req.body.link,
                    feedback: req.body.feedback,
                    place: offer.place,
                    accepted: false,
                    user: req.user._id,
                    booking: booking._id,
                  };
  
                  Counter.findOneAndUpdate(
                    {_id: "offerpostid"},
                    {$inc: {seq: 1}},
                    {new: true},
                    function (err, seq) {
                      if (err) console.log(err);
                      offerPost._id = seq.value.seq;
      
                      OfferPost.insertOne(offerPost);
      
                      Offer.findOneAndUpdate({_id: offerPost.offer, isActive: true}, {$set: {post: seq.value.seq}}, function (err, offer) {
                        if (!offer.value) {
                          return res.json({message: "No such offer"});
                        } else {
                          Booking.updateOne(
                            { 'offerActions.offerId': offerPost.offer, _id : bookingId  },
                            { $set: { 'offerActions.$.actions.$[t].active': false }},
                            { arrayFilters: [ {"t.type": offerPost.type  } ] } , async (err, booking) => {
                              if (err) {
                                return res.status(500).json({ message: 'Internal server error' });
                              }
                              Place.findOneAndUpdate({_id: offer.value.place}, {$push: {posts: seq.value.seq}});
                              let user;
                              try {
                                user = await userRepository
                                  .findOneAndUpdateAction(offerPost.user, offerPost.type, { $push: { offerPosts: seq.value.seq } });
                                if (!user) {
                                  return res.status(404).json({ message: 'User not found' });
                                }
                                return res.json({ message: 'Offer post created' });
                              } catch (error) {
                                return res.status(500).json({ message: 'Internal server error' });
                              }
                            });
                        }
                      });
                    }
                  );
                }
              }
            }
          }
        })
      }
    });
  }
  });
  });
  
  app.post('/api/offer/:id/activate', middleware.isAdmin, async (req, res, next) => {
    try {
      const id = parseInt(req.params.id);
      if (!id) {
        throw ErrorResponse.BadRequest('Specify id');
      }

      const offer = await Offer.findOne({ _id: id });
      if (!offer) {
        throw ErrorResponse.NotFound('Wrong id');
      }

      const updatedOffer = await Offer.findOneAndUpdate(
        { _id: id },
        {
          $set: {
            isActive: true,
          },
        },
        {
          returnOriginal: false,
          returnNewDocument: true,
        });
      return res.status(200).json(updatedOffer.value);
    } catch (error) {
      return next(error);
    }
  });

  app.post('/api/offer/:id/deactivate', middleware.isAdmin, async (req, res, next) => {
    try {
      const id = parseInt(req.params.id);
      if (!id) {
        throw ErrorResponse.BadRequest('Specify id');
      }

      const offer = await Offer.findOne({ _id: id });
      if (!offer) {
        throw ErrorResponse.NotFound('Wrong id');
      }

      const updatedOffer = await Offer.findOneAndUpdate(
        { _id: id },
        {
          $set: {
            isActive: false,
          },
        },
        {
          returnOriginal: false,
          returnNewDocument: true,
        });
      return res.status(200).json(updatedOffer.value);
    } catch (error) {
      return next(error);
    }
  });

  // Get all OfferPosts created today
  app.get('/api/offerPosts/today', function (req, res) {
    var today = moment().format('DD-MM-YYYY');
    OfferPost.find({creationDate: {$lte: today}}).toArray(function (err, posts) {
      res.json(posts);
    });
  });

  // Get all approved OfferPosts
  app.get('/api/offerPosts/approved', function (req, res) {
    OfferPost.find({accepted: true}).toArray(async function (err, posts) {
      var full = await Promise.all(posts.map(async function (post) {
        post.user = await User.findOne({_id: post.user}, {projection: {name: 1, surname: 1, photo: 1}});
        return post;
      }));
      res.json(full);
    });
  });

  // Get all OfferPosts
  app.get('/api/offerPosts', function (req, res) {
    OfferPost.find({}).toArray(function (err, posts) {
      res.json(posts);
    });
  });

  // Get the OfferPost with the Offer inside it
  app.get('/api/offer/post/:id', function (req, res) {
    var id = parseInt(req.params.id);
    OfferPost.findOne({_id: id}, async function (err, offerPost) {
      if (!offerPost) {
        res.json({message: "No such post"});
      } else {
        offerPost.offer = await Offer.findOne({_id: offerPost.offer});
        res.json(offerPost);
      }
    })
  });

  // Get the OfferPosts belonging to some offer
  app.get('/api/offer/:id/posts', function (req, res) {
    var id = parseInt(req.params.id);
    OfferPost.find({offer: id}).toArray(function (err, posts) {
      res.json(posts);
    });
  });
 
  //Delete image
  app.delete('/api/offer/:id/images', async (req,res) => {
    var id = parseInt(req.params.id);
    var imageId = req.body.imageId;
    if(id){
      var offer = await Offer.findOne({ _id : id });
      if(offer){
        var image = offer.images.find( x=>x.id == imageId);
        if(image){
          await imageUplader.deleteImage(image.cloudinaryId)
          .then(() => {
            Offer.findOneAndUpdate({_id: id}, { $pull: { 'images' : { 'id': image.id } }})
              .then(async () => {
                if(offer.mainImage == image.url){
                  await Offer.findOneAndUpdate({_id: id }, {$set: { mainImage:  null } })
                }
                res.status(200).json({message: 'ok'});
              })
              .catch((err) => {
                console.log(err);
              })
          })
          .catch((err) => {
            res.status(400).json({message : err });
        });
      }else{
        res.status(404).json({message : "Image is for the wrong offer"});
      }
      }else{
        res.status(404).json({message : "offer not found"});
      }
    }else{
      res.status(404).json({message : "invalid parameters"});
    }
    
  });
   //Add new images to offer
  app.post('/api/offer/:id/images', async (req,res) => {
    var id = parseInt(req.params.id);
    if(id){
      var offer = await Offer.findOne({ _id : id });
      if(offer){
      var form = new multiparty.Form();
      form.parse(req, async function (err, fields, files) {
        if(files){
          files = files.images;
          for (file of files) {
            await imageUplader.uploadImage(file.path, 'offers', offer._id)
              .then(async (newImage) =>{
                await Offer.findOneAndUpdate({ _id: id }, { $push: { images: newImage } })
              })
              .catch((err) => {
                console.log(err);
              });
          }
          res.status(200).json({message: "ok"});
        }else{
          res.status(400).json({message : 'no files added'});
        }
      });
    }else{
      res.status(404).json({message : "offer not found" });
    }
    }else{
      res.status(404).json({message : "invalid parameters"});
      }
  });
  //change main image
  app.put('/api/offer/:id/images/:imageId/main', async (req,res) => {
    var id = parseInt(req.params.id);
    var imageId = req.params.imageId;
    if(id && imageId){
      var offer = await Offer.findOne({ _id : id });
      if(offer && offer.images && offer.images.find( x=>x.id == imageId)){
        await Offer.findOneAndUpdate({ _id : id }, {$set : { 'images.$[].isMainImage': false } } );
        var image = offer.images.find( x=>x.id == imageId);
        await Offer.findOneAndUpdate({ _id : id }, 
          { $set : { mainImage : image.url, 'images.$[t].isMainImage' : true }},
          { arrayFilters: [ {"t.id": imageId  } ] }
          )
          res.status(200).json({message: "ok"});
      }else{
        res.status(404).json({message : "offer not found"});
      }
    }else{
      res.status(404).json({message : "invalid parameters"});
    }
  });

  //edit existing offer
  app.put('/api/offer/:id', async (req,res) => {
    let id = parseInt(req.params.id);
    let reqOffer = req.body.offer;
    if(id){
      var offer = await Offer.findOne({ _id : id});
      if(offer){
        await Offer.replaceOne({ _id : id }, reqOffer);
        res.status(200).json(await Offer.findOne({ _id: id}));
      }else{
        res.status(404).json({message : "offer not found"});
      }
    }else{
      res.status(404).json({message: "invalid parameters" });
    }
  });
};


validateOfferIntervals = async (placeId,intervals) => {
  let isValid = true;
  if(intervals && Array.isArray(intervals)){
    for (const interval of intervals) {
      let intervalObjectKeys = Object.keys(interval);
        if(intervalObjectKeys.find(y => y == 'start') && intervalObjectKeys.find(y => y == 'end')){
          if(moment(`2019-01-01 ${interval.start.replace('.',':')}`).isValid() && moment(`2019-01-01 ${interval.end.replace('.',':')}`).isValid()){
            interval.start = moment(`2019-01-01 ${interval.start.replace('.',':')}`).format('HH.mm');
            interval.end = moment(`2019-01-01 ${interval.end.replace('.',':')}`).format('HH.mm');
            var dbInterval = await Interval.findOne({place: placeId, intervals: { $elemMatch : { start: interval.start, end : interval.end } } });
            if(!dbInterval){
              isValid = false;
            }
          }else{
            isValid = false;
          }
        }else{
          isValid = false;
        }
      }
  }else{
    isValid = false;
  }
  return isValid;
}