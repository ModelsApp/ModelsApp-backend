var fs = require('fs');
var path = require('path');
var http = require('http');

module.exports = (app) => {
    app.get('/accept', async (req, res) => {
        var filePath = path.join(__dirname, '../htmlTemplates/userAccepted.html')
        res.sendFile(filePath);
    });
}