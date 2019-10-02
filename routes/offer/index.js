const _ = require('lodash');
const moment = require('moment');
const multiparty = require('multiparty');

const middleware = require('../../config/authMiddleware');
const imageUploader = require('../../lib/imageUplader');
const pushProvider = require('../../lib/pushProvider');
const calculateActionPoints = require('../actionPoints/calculator/action');
const ErrorResponse = require('./../../core/errorResponse');
const { OFFER_SCOPES } = require('./constant');
const postOfferSchema = require('./schema/postOffer');
const postActionSchema = require('./schema/postAction');

module.exports = (
  app, actionPointsRepository, userRepository, offerRepository, validate,
  User, Place, Offer, Interval, Counter, Booking, OfferPost, SamplePost, getNewId) => {

  // Get specific Offer
  app.get('/api/place/offer/:id', async (req, res, next) => {
    try {
      const id = parseInt(req.params.id);
      const { userID } = req.query;

      const offer = await Offer.findOne({ _id: id, isActive: true });
      if (!offer) throw ErrorResponse.NotFound('no such offer');

      if (userID) {
        const user = parseInt(userID);
        offer.posts = await OfferPost.find({ user: user, offer: offer._id }).toArray();
      }

      if (!offer.place) {
        return res.status(200).json(offer);
      }
      offer.place = await Place.findOne({ _id: offer.place }, { projection: { socials: 1 } });

      if (!offer.place.socials) {
        return res.status(200).json({ ...offer, instaUser: '' });
      }

      if (offer.place.socials.instagram) {
        const { instagram } = offer.place.socials;
        const regexp = instagram.match(/instagram.com\/(.*)\/?\??/i);
        offer.instaUser = regexp[1];
      }

      return res.status(200).json(offer);
    } catch (error) {
      return next(error);
    }
  });

  // Get all offers belonging to specified place
  app.get('/api/place/:id/offer', async (req, res, next) => {
    try {
      const id = parseInt(req.params.id);
      const query = { place: id, isActive: true };
      const { scopes } = req.query;

      if (scopes) {
        query.scopes = scopes;
      }

      const offers = await Offer.find(query).toArray();

      return res.status(200).json(offers);
    } catch (error) {
      return next(error);
    }
  });

  app.get('/api/place/:id/bookingOffers', async (req, res, next) => {
    try {
      const id = parseInt(req.params.id);
      const { start, end } = req.body;

      const offers = await Offer.find({ place: id, start: start, end: end, isActive: true, }).toArray();

      return res.status(200).json(offers);
    } catch (error) {
      return next(error);
    }
  });

  app.get('/api/v2/offer/booking/actions', middleware.isAuthorized, async (req, res, next) => {
    try {
      const user = await req.user;
      const offerId = parseInt(req.query.offerId);
      const bookingId = parseInt(req.query.bookingId);

      if (!offerId || !bookingId) {
        throw ErrorResponse.BadRequest('missing required parameters, offerId or bookingId');
      }

      const offer = await Offer.findOne({ _id: offerId, isActive: true });
      const booking = await Booking.findOne({ _id: bookingId });

      if (!offer || !booking) {
        throw ErrorResponse.NotFound('offer or booking not found');
      }

      const newActions = (booking.actions || []).filter(action => action.offerId !== offerId);

      const offerAction = {
        offerId,
        actions: await generateActions(offer, user.level),
      };
      newActions.push(offerAction);

      await Booking.findOneAndUpdate({ _id: bookingId }, { $set: { actions: newActions } });

      return res.status(200).json(offerAction.actions);
    } catch (error) {
      return next(error);
    }
  });

  app.get('/api/offer/:id/booking/:bookingId/actions', middleware.isAuthorized, async (req, res, next) => {
    try {
      const offerId = parseInt(req.params.id);
      const bookingId = parseInt(req.params.bookingId);
      const user = await req.user;

      if (!offerId || !bookingId) {
        throw ErrorResponse.BadRequest('invalid parameters');
      }

      const offer = await Offer.findOne({ _id: offerId, isActive: true });
      if (!offer) throw ErrorResponse.NotFound('offer not found');

      const booking = await Booking.findOne({ _id: bookingId });

      if (!booking) throw ErrorResponse.NotFound('booking not found');
      const { offerActions } = booking;

      // check if user already chose action for particular offer
      const filteredOfferActions = offerActions.filter(offerAction => offerAction.offerId === offerId);
      if (filteredOfferActions.length > 0) {
        return res.status(200).json(filteredOfferActions[0].actions);
      }

      // first appearance so we need to create available actions
      const offerAction = {
        offerId: offerId,
        actions: await generateActions(offer, user.level),
      };
      await Booking.findOneAndUpdate({ _id: bookingId }, { $push: { offerActions: offerAction } });
      return res.status(200).json(offerAction.actions);
    } catch (error) {
      return next(error);
    }
  });

  function getAvailableActionTypes() {
    return {
      'instaStories': 'Instagram story',
      'instaPost': 'Instagram post',
      'fbPost': 'Facebook post',
      'tripAdvisorPost': 'Tripadvisor',
      'yelpPost': 'Yelp review',
      'gPost': 'Google post'
    };
  }

  async function generateActions(offer, userLevel) {
    const { credits } = offer;
    const actionPointsProviders = await actionPointsRepository.find();
    const offerCreditsArray = Array.from(Object.keys(credits));

    return offerCreditsArray.map(x => {
      const actionPoints = actionPointsProviders.find(ap => ap.provider === x);
      if (!actionPoints) {
        return null;
      }
      return {
        displayName: getAvailableActionTypes()[x],
        type: x,
        credits: calculateActionPoints(actionPoints.points, userLevel, offer.level),
        image: (actionPoints || {}).image || null,
        active: true,
      };
    }).filter(y => y);
  }

  app.get('/api/offer/:id/actions', middleware.isAuthorized, async (req, res, next) => {
    try {
      const user = await req.user;
      const id = parseInt(req.params.id);

      const offer = await Offer.findOne({ _id: id, isActive: true });
      const actions = await generateActions(offer, user.level);

      return res.status(200).json(actions);
    } catch (error) {
      return next(error);
    }
  });

  // Create the offer. Then wait for the post, admin's check of the post, and then close it
  app.post('/api/place/:id/offer', async (req, res, next) => {
    try {
      const validation = validate(req.body, postOfferSchema);
      if (validation.error) throw ErrorResponse.BadRequest(validation.error);

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

      const user = await User.findOne({ _id: offer.user }, { projection: { name: 1 } });
      if (!user) {
        throw ErrorResponse.NotFound('no such user');
      }

      const seq = await Counter.findOneAndUpdate(
        { _id: 'offerid' },
        { $inc: { seq: 1 } },
        { new: true });

      offer._id = seq.value.seq;
      const place = await Place.findOneAndUpdate({ _id: id }, { $push: { offers: seq.value.seq } });
      if (!place.value) {
        throw ErrorResponse.NotFound('no such place');
      }

      await User.findOneAndUpdate({ _id: offer.user }, { $push: { offers: seq.value.seq } });
      await Offer.insertOne(offer);
      const users = await User.find({ accepted: true }).toArray();
      const posts = await OfferPost.distinct('user', { place: place.value._id });
      let devices = [];
      for (post of posts) {
        const user = users.find(u => u._id === post);
        if (user) devices.push(user.devices);
      }
      if (devices.length) {
        devices = devices.reduce((a, b) => a.concat(b));
        await pushProvider.sendNewOfferNotification(devices, offer, place.value);
      }

      return res.status(201).json({ message: 'Offer created' });
    } catch (error) {
      return next(error);
    }
  });

  // Deletes the offer document and all links to it
  app.delete('/api/place/offer/:id', async (req, res, next) => {
    try {
      const id = parseInt(req.params.id);
      const offer = await Offer.findOne({ _id: id });
      if (!offer) {
        throw ErrorResponse.NotFound('no such offer');
      }
      const updated = await Place.findOneAndUpdate(
        { _id: parseInt(offer.place) },
        { $pull: { offers: id } });
      if (!updated.value) {
        throw ErrorResponse.Internal('could not be deleted');
      }
      const deleted = await Offer.deleteOne({ _id: id });
      if (deleted.deletedCount === 0) {
        throw ErrorResponse.Internal('could not delete');
      }
      return res.status(200).json({ message: 'deleted' });
    } catch (error) {
      return next(error);
    }
  });


  // Posts section
  // ____________________________

  // Get the app know if the User created a post to pay for the offer

  app.post('/api/place/:id/post/sample', async (req, res, next) => {
    try {
      if (!req.body.feedback) {
        throw ErrorResponse.BadRequest('feedback is required');
      }
      const samplePost = {
        feedback: req.body.feedback,
        place: parseInt(req.params.id),
        updatedTime: moment().format('DD-MM-YYYY'),
        users: [],
      };
  
      const post = await SamplePost.findOne({ place: samplePost.place, feedback: samplePost.feedback });
      if (post) {
        throw ErrorResponse.Unauthorized('The sample of the post with this review already exist');
      }
      const seq = await Counter.findOneAndUpdate({ _id: "samplepostid" }, { $inc: { seq: 1 } }, { new: true });
      samplePost._id = seq.value.seq;
      await SamplePost.insertOne(samplePost);

      return res.status(200).json({ message: 'Successfully added' });
    } catch (error) {
      return next(error);
    }
  });

  function randomInteger(min, max) {
    var rand = min - 0.5 + Math.random() * (max - min + 1);
    rand = Math.round(rand);
    return rand;
  }

  // Get all post samples by placeID and Action
  app.get('/api/place/:id/sample', middleware.isAuthorized, async (req, res, next) => {
    try {
      const id = parseInt(req.params.id);

      const checkSample = await SamplePost.findOne({});
      if (checkSample.updatedDate !== moment().format('DD-MM-YYYY')) {
        await SamplePost.updateMany({}, { $set: { updatedDate: moment().format('DD-MM-YYYY'), users: [] } });
      }
  
      const user = await req.user;
      const posts = await SamplePost.find(
        {
          place: id,
          users: { $not: { $elemMatch: { $eq: user._id } } },
        }).toArray();
      if (posts.length === 0) throw ErrorResponse.NotFound('no samples for you');
      const post = await posts[randomInteger(0, posts.length - 1)];
      await SamplePost.findOneAndUpdate({ _id: post._id }, { $push: { users: user._id } });

      return res.status(200).json({ message: post.feedback });
    } catch (error) {
      return next(error);
    }
  });

  app.post('/api/place/offer/:id/post', middleware.isAuthorized, async (req, res, next) => {
    try {
      const u = await req.user;
      const { postType } = req.body;
      const offer = await offerRepository.findOne(parseInt(req.params.id));
      if (!offer) {
        throw ErrorResponse.NotFound(`Couldnt find offer for id ${req.params.id}`);
      }
  
      if (!postType || !req.body.link || !req.body.feedback) {
        throw ErrorResponse.BadRequest('Not all fields are provided');
      }
  
      const actionPoints = await actionPointsRepository.findOne(postType);
  
      if (!offer.credits[postType] || !actionPoints) {
        throw ErrorResponse.BadRequest('This Post type is unsupported');
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

      const seq = await Counter.findOneAndUpdate(
        { _id: 'offerpostid' },
        { $inc: { seq: 1 } },
        { new: true });

      offerPost._id = seq.value.seq;
      await OfferPost.insertOne(offerPost);

      const offerUpdated = await Offer.findOneAndUpdate(
        { _id: offerPost.offer, isActive: true },
        { $set: { post: seq.value.seq } });
      
      if (!offerUpdated.value) {
        throw ErrorResponse.NotFound('no such offer');
      }
      await Place.findOneAndUpdate({ _id: offerUpdated.value.place }, { $push: { posts: seq.value.seq } });
      const updatedUser = await userRepository
        .findOneAndUpdateAction(offerPost.user, postType, { $push: { offerPosts: seq.value.seq } });
      if (!updatedUser) {
        throw ErrorResponse.NotFound('user not found');
      }
      return res.status(201).json({ message: 'Offer post created' });
    } catch (error) {
      return next(error);
    }
  });

  app.post('/api/v2/offer/booking', middleware.isAuthorized, async (req, res, next) => {
    try {
      const form = new multiparty.Form();
      const { fields, files } = await new Promise((resolve, reject) => form.parse(
        req, async (err, fields, files) => {
          if (err) {
            reject(err);
          }
          resolve({ fields, files });
        }));

      let expectedBody;
      try {
        expectedBody = {
          bookingId: parseInt(fields.bookingId[0]),
          offerId: parseInt(fields.offerId[0]),
          actionType: fields.actionType[0],
          star: fields.star ? parseInt(fields.star[0]) : 0,
          feedback: fields.feedback ? fields.feedback[0] : null,
          link: fields.link ? fields.link[0] : null,
        };
      } catch (error) {
        throw ErrorResponse.BadRequest('wrong parameters');
      }
      const validation = validate(expectedBody, postActionSchema);
      if (validation.error) throw ErrorResponse.BadRequest(validation.error);

      const user = await req.user;

      const offer = await offerRepository.findById(expectedBody.offerId);
      const booking = await Booking.findOne({ _id: expectedBody.bookingId });

      if (!offer) throw ErrorResponse.NotFound('offer not found');
      if (!booking) throw ErrorResponse.NotFound('booking not found');

      const dbOfferPost = await OfferPost.findOne({
        offer: expectedBody.offerId,
        booking: expectedBody.bookingId,
        type: expectedBody.actionType
      });
      const bookingAction = (booking.actions || []).find(x => x.offerId === offer._id);

      if (!bookingAction) throw ErrorResponse.BadRequest('no actions for this offerId');

      let foundBookingAction = bookingAction.actions.find(action => action.type === expectedBody.actionType);
      if (!foundBookingAction) throw ErrorResponse.BadRequest('no such action available');
      if (dbOfferPost) throw ErrorResponse.Unauthorized('action has already been already posted');

      const id = await getNewId('offerpostid');
      const actionPoints = await actionPointsRepository.findOne(foundBookingAction.type);
      if (!actionPoints) throw ErrorResponse.BadRequest('unsupported action type');

      let image;
      if ((files.images || []).length) {
        image = await imageUploader.uploadImage(files.images[0].path, 'postOffer', offer._id);
      }

      const offerPost = {
        _id: id,
        type: foundBookingAction.type,
        credits: calculateActionPoints(actionPoints.points, user.level, offer.level),
        offer: offer._id,
        stars: expectedBody.star,
        creationDate: moment().format('DD-MM-YYYY'),
        link: expectedBody.link,
        feedback: expectedBody.feedback,
        place: offer.place,
        accepted: false,
        user: user._id,
        booking: booking._id,
        image: image || null,
      };
      await OfferPost.insertOne(offerPost);
      await Place.findOneAndUpdate({ _id: offer.place }, { $push: { posts: id } });

      await userRepository
        .findOneAndUpdateAction(
          offerPost.user,
          foundBookingAction.type,
          {
            $push: {
              offerPosts: id,
              offerPostsV2: { id, createdAt: moment().format('DD-MM-YYYY HH:mm:ss') },
            },
          });

      return res.status(200).json(offerPost);
    } catch (error) {
      return next(error);
    }
  });

  app.post('/api/offer/:id/booking/:bookingId/post', middleware.isAuthorized, async (req, res, next) => {
    try {
      const u = await req.user;
      const bookingId = parseInt(req.params.bookingId);
      if (!req.body.postType) throw ErrorResponse.BadRequest('postType is required');
  
      //todo should be removed after ios update
      if (req.body.postType && req.body.postType === 'google') {
        req.body.postType = req.body.postType.replace('google', 'gPost');
      }

      const dbOfferPost = await OfferPost.findOne(
        {
          offer: parseInt(req.params.id),
          booking: bookingId,
          type: req.body.postType
        });
      if (dbOfferPost) throw ErrorResponse.Unauthorized('you have already done this action');

      const offer = await Offer.findOne({ _id: parseInt(req.params.id), isActive: true });
      if (!offer) throw ErrorResponse.NotFound('no such offer');

      const booking = await Booking.findOne({ _id: bookingId });
      if (!booking) throw ErrorResponse.NotFound('no such booking');

      if (!(!req.body.postType
        || !req.body.link
        || (req.body.postType != 'instaStories' && req.body.postType != 'instaPost' && !req.body.feedback))) {
        throw ErrorResponse.BadRequest('not all fields are provided');
      }

      if (!offer.credits[req.body.postType]) throw ErrorResponse.BadRequest('this post type is not supported');

      const actionPoints = await actionPointsRepository.findOne(req.body.postType);
      if (!actionPoints) throw ErrorResponse.BadRequest('action type not supported');

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

      const seq = await Counter.findOneAndUpdate(
        { _id: "offerpostid" },
        { $inc: { seq: 1 } },
        { new: true });

      offerPost._id = seq.value.seq;

      await OfferPost.insertOne(offerPost);
      const offerUpdated = await Offer.findOneAndUpdate(
        {
          _id: offerPost.offer,
          isActive: true,
        },
        {
          $set: { post: seq.value.seq },
        });
      if (!offerUpdated.value) throw ErrorResponse.NotFound('no such offer');

      await Booking.updateOne(
        { 'offerActions.offerId': offerPost.offer, _id: bookingId },
        { $set: { 'offerActions.$.actions.$[t].active': false } },
        { arrayFilters: [{ "t.type": offerPost.type }] });
      
      await Place.findOneAndUpdate({ _id: offerUpdated.value.place }, { $push: { posts: seq.value.seq } });
      const user = await userRepository
        .findOneAndUpdateAction(offerPost.user, offerPost.type, { $push: { offerPosts: seq.value.seq } });
      if (!user) throw ErrorResponse.NotFound('user not found');

      return res.json({ message: 'Offer post created' });
    } catch (error) {
      return next(error);
    }
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
  app.get('/api/offerPosts/today', async (req, res, next) => {
    try {
      const today = moment().format('DD-MM-YYYY');
      const posts = await OfferPost.find({ creationDate: { $lte: today } }).toArray();
  
      return res.status(200).json(posts);
    } catch (error) {
      return next(error);
    }
  });

  // Get all approved OfferPosts
  app.get('/api/offerPosts/approved', async (req, res, next) => {
    try {
      const posts = await OfferPost.find({ accepted: true }).toArray();
      const full = await Promise.all(posts.map(async (post) => {
          post.user = await User.findOne({ _id: post.user }, { projection: { name: 1, surname: 1, photo: 1 } });
          return post;
        }));
      return res.status(200).json(full);
    } catch (error) {
      return next(error);
    }
  });

  app.get('/api/offerPosts', async (req, res, next) => {
    try {
      let { limit = 10, page = 1 } = req.query;
      limit = parseInt(limit);
      page = parseInt(page);

      const posts = await OfferPost
        .find({})
        .skip(limit*(page+1))
        .limit(limit)
        .sort({ _id: 1 })
        .toArray();

      return res.status(200).json(posts);
    } catch (error) {
      return next(error);
    }
  });

  // Get the OfferPost with the Offer inside it
  app.get('/api/offer/post/:id', async (req, res, next) => {
    try {
      const id = parseInt(req.params.id);
      const offerPost = await OfferPost.findOne({ _id: id });

      if (!offerPost) throw ErrorResponse.NotFound('no such post');

      offerPost.offer = await Offer.findOne({ _id: offerPost.offer });
      
      return res.status(200).json(offerPost);
    } catch (error) {
      return next(error);
    }
  });

  // Get the OfferPosts belonging to some offer
  app.get('/api/offer/:id/posts', async (req, res, next) => {
    try {
      const id = parseInt(req.params.id);
      const posts = await OfferPost.find({ offer: id }).toArray();
  
      return res.status(200).json(posts);
    } catch (error) {
      return next(error);
    }
  });

  // Delete image
  app.delete('/api/offer/:id/images', async (req, res, next) => {
    try {
      const id = parseInt(req.params.id);
      const { imageId } = req.body;

      if (!id) throw ErrorResponse.BadRequest('id is required');
      if (!imageId) throw ErrorResponse.BadRequest('imageId is required');

      const offer = await Offer.findOne({ _id: id });
      if (!offer) throw ErrorResponse.NotFound('offer not found');

      const image = offer.images.find(x => x.id === imageId);
      if (!image) throw ErrorResponse.NotFound('image is for the wrong offer');

      await imageUploader.deleteImage(image.cloudinaryId);
      await Offer.findOneAndUpdate({ _id: id }, { $pull: { 'images': { 'id': image.id } } });

      if (offer.mainImage === image.url) {
        await Offer.findOneAndUpdate({ _id: id }, { $set: { mainImage: null } })
      }

      return res.status(200).json({ message: 'ok' });
    } catch (error) {
      return next(error);
    }
  });
  // Add new images to offer
  app.post('/api/offer/:id/images', async (req, res, next) => {
    try {
      const id = parseInt(req.params.id);
      if (!id) throw ErrorResponse.BadRequest('id is required');

      const offer = await Offer.findOne({ _id: id });
      if (!offer) throw ErrorResponse.NotFound('offer not found');

      const form = new multiparty.Form();
      const { files } = await new Promise((resolve, reject) => form
        .parse(req, async (err, fields, files) => {
          if (err) reject(err);
          resolve({ fields, files });
        }));

      const { images } = files;
      for (image of images) {
        const newImage = await imageUploader.uploadImage(image.path, 'offers', offer._id);
        await Offer.findOneAndUpdate({ _id: id }, { $push: { images: newImage } });
      }

      return res.status(200).json({ message: 'ok' });
    } catch (error) {
      return next(error);
    }
  });

  // change main image
  app.put('/api/offer/:id/images/:imageId/main', async (req, res, next) => {
    try {
      const id = parseInt(req.params.id);
      const { imageId } = req.params;
      if (!id) throw ErrorResponse.BadRequest('id is required');
      if (!imageId) throw ErrorResponse.BadRequest('imageId is required');
  
      const offer = await Offer.findOne({ _id: id });
      if (!offer || !offer.images || offer.images.find(x => x.id == imageId)) {
        throw ErrorResponse.NotFound('wrong id');
      }
      await Offer.findOneAndUpdate({ _id: id }, { $set: { 'images.$[].isMainImage': false } });
      const image = offer.images.find(x => x.id === imageId);
      await Offer.findOneAndUpdate({ _id: id },
        { $set: { mainImage: image.url, 'images.$[t].isMainImage': true } },
        { arrayFilters: [{ "t.id": imageId }] });
  
      return res.status(200).json({ message: 'ok' });
    } catch (error) {
      return next(error);
    }
  });

  // edit existing offer
  app.put('/api/offer/:id', async (req, res, next) => {
    try {
      const id = parseInt(req.params.id);
      const reqOffer = req.body.offer;

      if (!id) throw ErrorResponse.BadRequest('id is required');

      const offer = await Offer.findOne({ _id: id });
      if (!offer) throw ErrorResponse.NotFound('offer not found');

      await Offer.replaceOne({ _id: id }, reqOffer);
      return res.status(200).json(await Offer.findOne({ _id: id }));
    } catch (error) {
      return next(error);
    }
  });
};
