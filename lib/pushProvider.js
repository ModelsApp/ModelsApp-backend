var apn = require('apn');
var path = require('path');
var fcm = require('fcm-notification');
var FCM = new fcm(path.join(__dirname, '../key.json'));

var apnProviderProduction = new apn.Provider({
    production: true,
    cert: 'cert.pem',
    key: 'key.pem'
});
var apnProviderTest = new apn.Provider({
    production: false,
    cert: path.join(__dirname, '../apnTest/cert.pem'),
    key:  path.join(__dirname, '../apnTest/key.pem')
});


var exports = module.exports = {};

exports.userAcceptNotification = async (devices) => {
    var note = getNotificationNote();
    note.alert = `\uD83D\uDCE7 \u2709 Your account has beed accepted!`;
    note.payload = { message: `Now you have access to all resources`, pushType: 'userAccept' };
    var message = {
      data: { pushType: 'userAccept' },
      notification:{
          title : 'Your account has beed accepted!',
          body : 'Now you have access to all resources'
      },  token : null };
    
      await sendMessage(note, devices, message);
  }
  exports.userRejectNotification = async (devices) => {
    var note = getNotificationNote();
    note.alert = `\uD83D\uDCE7 \u2709 Your account has beed rejected!`;
    note.payload = { message: `You lost access to account`, pushType: 'userRejected' };
    var message = {
      data: { pushType: 'userRejected' },
      notification:{
          title : 'Your account has beed rejected!',
          body : 'You lost access to account'
      },  token : null };
  
      await sendMessage(note, devices, message);
  }
  exports.actionAcceptNotification = async (devices) => {
    var note = getNotificationNote();
    note.alert = `\uD83D\uDCE7 \u2709 You get new credits!`;
    note.payload = { message: `We accepted your action`, pushType: 'actionAccepted' };
    var message = {
      data: { pushType: 'actionAccepted' },
      notification:{
          title : 'You get new credits!',
          body : 'We accepted your action'
      },  token : null };
  
      await sendMessage(note, devices, message);
}
exports.creditAddNotification = async (devices, creditValue) => {
  var note = getNotificationNote();
  note.alert = `\uD83D\uDCE7 \u2709 You get new credits!`;
  note.payload = { message: `You get extra credits have fun!`, pushType: 'creditsAdded', credits: creditValue };

  var message = {
    data: { pushType: 'creditsAdded', credits: creditValue },
    notification:{
        title : 'You get new credits!',
        body : 'You get extra credits have fun!'
    },  token : null };

    await sendMessage(note, devices, message);
}
exports.bookingClosedNotification = async (devices, payed, placeName) => {
    var note = getNotificationNote();

    note.alert = `\uD83D\uDCE7 \u2709 Booking closed!`;
    note.payload = { 
      message: `Your booking has been closed you lost change to get points`,
      pushType: 'bookingClosed', 
      bookingCredits: payed,
      bookingName : placeName
     };
     var message = {
        data: { 
          pushType: 'bookingClosed', 
          bookingCredits: payed,
          bookingName : placeName
      },
      notification:{
          title : 'Booking closed!',
          body : 'Your booking has been closed you lost change to get points'
      },  token : null };
  
    await sendMessage(note, devices, message);
  };
  exports.sendReferralINotification = async (devices, user) => {
    var note = getNotificationNote();
    note.alert = `\uD83D\uDCE7 \u2709 New referral!`;
    note.payload = { message: `You have one new referral: ${user}`, referralAccepted: 1, pushType: 'newReferral' };
    
    var message = {
      data: { pushType: 'newReferral' },
      notification:{
          title : `New referral!`,
          body : `You have one new referral: ${user}`
      },  token : null };

      await sendMessage(note, devices, message);
  }
  exports.sendNewPlaceNotification = async(devices, place) => {
    var note = getNotificationNote();
    note.alert = `\uD83D\uDCE7 \u2709 New ${place.type.toLowerCase()} added!`;
    note.payload = { message: `Come and see offer!`, place: place._id, pushType: 'newRestaurant' };

    var message = {
      data: { place: place._id, pushType: 'newRestaurant' },
      notification:{
          title : `New ${place.type.toLowerCase()} added!`,
          body : 'Come and see offer!'
      },  token : null };

    await sendMessage(note, devices, message);
  }
  exports.sendNewOfferNotification = async(devices, offer, place) => {
    var note = getNotificationNote();
    note.alert = `\uD83D\uDCE7 \u2709 New offer in ${place.type.toLowerCase()} - ${ offer.name } added!`;
    note.payload = { message: `Come and try it!`, place: place._id, offer: offer._id, pushType: 'newOffer' };

    var message = {
      data: { place: place._id, offer: offer._id, pushType: 'newOffer' },
      notification:{
          title : `New offer in ${place.type.toLowerCase()} - ${ offer.name } added!`,
          body : 'Come and try it!'
      },  token : null };

    await sendMessage(note, devices, message);
  }
function getNotificationNote(){
    var note = new apn.Notification();
    note.expiry = Math.floor(Date.now() / 1000) + 3600; // Expires 1 hour from now.
    note.badge = 1;
    note.topic = 'com.squaregroup.ModelsApp.new';
    return note;
}
async function sendMessage(note, devices, message){
  for(device of devices){
    if(typeof device == Object || typeof device == 'object'){
      if(device.type == 'android'){
        message.token = device.token;
       // await FCM.send(message);
      await FCM.send(message, function(err, response) {
        if(err){
            console.log('error found', err);
        }else {
            console.log('response here', response);
        }
    });
      }else{
        await apnProviderProduction.send(note, device.token);
        await apnProviderTest.send(note, device.token);
      }
    }else{
      await apnProviderProduction.send(note, device);
      await apnProviderTest.send(note, device);
    }
  }
}
