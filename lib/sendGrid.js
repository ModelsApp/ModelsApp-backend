const sgMail = require('@sendgrid/mail');
var config = require('../config/index');
var fs = require('fs');
var path = require('path');
const Sentry = require('@sentry/node');

Sentry.init({ dsn: config.sentryUrl });
sgMail.setApiKey(config.sendGridKey);

var exports = module.exports = {};

exports.sendConfirmAccountEmail = async (user,req) => {
  var formatedUrl = `${config.HOSTNAME}/api/user/${user._id}/confirm/${user.confirmHash}`
    const msg = {
        to: user.email,
        from: 'models@squaremm.com',
        subject: 'Please confirm your email',
        text: `Please follow link: ${formatedUrl}`,
        html: `Please follow link: <a href='${formatedUrl}'>${formatedUrl}</a>`,
      };
      send(msg);
};
exports.sendForgotPasswordEmail = async (temporaryPassword, user) => {
  const msg = {
      to: user.email,
      from: 'models@squaremm.com',
      subject: 'Forgot password',
      text: `Log into your application with temporary password: ${temporaryPassword}`,
      html: `Log into your application with temporary password: <strong>${temporaryPassword}</strong`,
    };
    send(msg);
}
exports.sendBookingReport = async (email, list, place) => {

  var html = `<h1> Report of bookings for ${ place.name } </h1> <div>`;
  list.forEach(element => {
    html += `<div> ${ element } </div>`
  });
  html += `</div>`
  const msg = {
      to: email,
      from: 'restaurants@squaremm.com',
      subject: 'New booking report',
      text: html,
      html: html,
    };
    send(msg);
}
exports.sendBookingCreated = async (email, list, place) => {

  var html = `<h1> New booking created for ${ place.name } </h1> <div>`;
  list.forEach(element => {
    html += `<div> ${ element } </div>`
  });
  html += `</div>`
  const msg = {
      to: email,
      from: 'restaurants@squaremm.com',
      subject: 'New booking report',
      text: html,
      html: html,
    };
    send(msg);
}
exports.sendUserAcceptedMail = async (email, req) => {
  var filePath = path.join(__dirname, '../htmlTemplates/userAccepted.html');
  fs.readFile(filePath, 'utf8', (err, html) => {
    if(err) console.log(err);
    var formatedUrl = `${req.protocol}://${req.host}/accept`;
    html = html.replace('_acceptEmailServerUrl', formatedUrl)
    const msg = {
      to: email,
      from: 'models@squaremm.com',
      subject: 'Welcome to SQUARE!',
      text: html,
      html: html,
    };
    send(msg);
  });
};
send = (msg) => {
  sgMail.send(msg, false, (error) => {
    if(error){
      console.log(error);
      Sentry.captureException(error);
    } 
  });;
}