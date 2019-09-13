var crypto = require('crypto');
var apn = require('apn');
var config =  require('../config/index');

var apnProvider = new apn.Provider({
  production: false,
});

async function sendIos(deviceId, user) {
  var note = new apn.Notification();
  note.expiry = Math.floor(Date.now() / 1000) + 3600; // Expires 1 hour from now.
  note.badge = 1;
  note.alert = `\uD83D\uDCE7 \u2709 New referral!`;
  note.payload = { message: `You have one new referral: ${user}`, pushType: 'referralAdded' };

  try{
    var data = await apnProvider.send(note, deviceId);
    console.log(data);
    return data;
  } catch(e){
    console.log(e);
  }
}

module.exports = (app, User, Place, Offer, Counter, Booking, OfferPost) => {

  app.get('/api/push/:device', function (req, res) {
    sendIos(req.params.device, 'Vova Putya');
    res.json({ message: "Sent" });
  });

  app.get('/', function(req, res) {
    res.json({ allRight: true })
  });

  // Generate a Bonus code
  app.post('/api/bonus', function (req, res) {
    var code = {};
    code.code = crypto.randomBytes(12).toString('hex');
    code.expired = false;
    code.user = null;

    Counter.findOneAndUpdate(
      { _id: "bonuscodesid" },
      { $inc: { seq: 1 } },
      { new: true },
      function(err, seq) {
        if (err) console.log(err);
        code._id = seq.value.seq;

        BonusCode.insertOne(code);
        res.json({ code: code.code });
      }
    );
  });

  // Give Bonus Codes to User
  app.put('/api/bonus/:code/get', function (req, res) {
    var bonusSum = parseInt(req.body.bonus);
    var id = parseInt(req.body.user);
    if(!id || !bonusSum) {
      res.json({ message: "Specify the User id or the Bonus amount" });
    } else {
      BonusCode.findOne({ code: req.params.code }, function (err, bonus){
        if(!bonus) {
          res.json({ message: "No such code" });
        } else {
          if(bonus.expired) {
            res.json({ message: "This code has expired"});
          } else {
            User.findOneAndUpdate({ _id: id }, { $inc: { credits: bonusSum }}, function (err, user) {
              if(err) console.log(err);
              if(!user.value) {
                res.json({ message: "No such User"});
              } else {
                BonusCode.findOneAndUpdate({ code: req.params.code }, { $set: { user: id, expired: true }});
                res.json({ message: "Successfully added a bonus" });
              }
            });
          }
        }
      });
    }
  });

  // Get all non-expired Bonus Codes
  app.get('/api/bonus', function (req, res) {
    BonusCode.find({ expired: false }).toArray(function (err, codes) {
      res.json(codes);
    });
  });
  
  app.post('/api/ios/version', (req, res) => {
    let iosVersion = req.body.version;
    if(iosVersion){
      iosVersion = parseInt(iosVersion);
      if(iosVersion < parseInt(config.iosVersion)){
        res.status(200).json({version : 'ok'})
      }else{
        res.status(400).json({version : 'not valid'})
      }
    }
  })
};
