var db = require('../config/connection');
var apn = require('apn');
var moment = require('moment');

var apnProvider = new apn.Provider({
  production: false,
});

async function bookingClosedNotification(devices) {
    var note = new apn.Notification();
    note.expiry = Math.floor(Date.now() / 1000) + 3600; // Expires 1 hour from now.
    note.badge = 1;
    note.alert = `\uD83D\uDCE7 \u2709 Booking closed!`;
    note.payload = { message: `Your booking has been closed you lost change to get points`, pushType: 'bookingClosed' };
  
    devices.forEach(async (device) => {
        await apnProvider.send(note, device);
     });
  };

  


exports.checkBookingExpired = function(db){
    setInterval(() => {
        intervalFunc(db);
    }, 60 * 60000);
  }
function intervalFunc(db) {
    console.log('start interval function');
    db.getInstance(function (p_db) {
        User = p_db.collection('users');
        Booking = p_db.collection('bookings'); 
        
        //retrive all users -> may be need to send push notification
        User.find({ accepted: true , bookings: { $gt: 0 } }).toArray(async (userError, users) => {
                //find all bookings that are not closed yet
                Booking.find({closed: false}).toArray( async (bookingError, bookings) => {
                        //check if any booking should be closed 
                        bookings.forEach(booking => {

                            var date = moment(booking.date + ' ' + booking.endTime, 'DD-MM-YYYY HH.mm');
                            var tommorow = moment(date.add('1', 'days').format('DD-MM-YYYY'), 'DD-MM-YYYY');
                            var diff = tommorow.diff(moment(), 'days');
                            if (diff < 0 && !booking.closed) {
                                //update booking 
                                Booking.findOneAndUpdate({_id: booking._id}, {$set: {closed: true}}, async (x) => {
                                        var user = users.find(user => user._id == booking.user);
                                        if(user){
                                            console.log('send notification');
                                          await bookingClosedNotification(user.devices);
                                        }
                                    });
                            }
                        });
                    });
                    
            });
    });
}
