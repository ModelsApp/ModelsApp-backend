var moment = require('moment');
var sendGrid = require('../lib/sendGrid');
var pushProvider = require('../lib/pushProvider');
var schedule = require('node-schedule');
 

  exports.sendReportBookingEmail = function(db){
    schedule.scheduleJob('50 20 * * *', function(){
      intervalFuncSendReportBookingEmail(db);
    });
  }

function intervalFuncSendReportBookingEmail (db) {
  console.log(`start interval function reportSend, at ${moment()}`);
  db.getInstance(function (p_db) {
      Booking = p_db.collection('bookings'); 
      Place = p_db.collection('places');
      User = p_db.collection('users');

        User.find({ }).toArray(async (userError, users) => {
        Place.find({ }).toArray(async (error, places) => {
          places.forEach(async (place) => {
            if(place.notificationRecivers && place.notificationRecivers.length > 0){
              var today = moment().format('DD-MM-YYYY');
             await Booking.find({ creationDate: {$eq: today}, place: place._id }).toArray(async (error, bookings) => {
                var listToSend = [];
                await bookings.forEach(async (booking) => {
                  var user = users.find(x=>x._id == booking.user);
                  let line = `booking date: ${ booking.date }, time:  ${booking.startTime }-${booking.endTime },`;
                  if(user){
                    line += ` user: ${user.name.charAt(0) } ${user.surname } `;
                  }
                  listToSend.push(line);
                });
                place.notificationRecivers.forEach(async (reciver) => {
                 await sendGrid.sendBookingReport(reciver.email, listToSend, place);
                });
              });
            }
          });
        });
      });
  });
}
