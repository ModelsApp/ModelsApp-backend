var cloudinary = require('cloudinary').v2
var crypto = require('crypto');
var config = require('../config/index');
const pngToJpeg = require('png-to-jpeg');
var pathLib = require('path')
const fs = require("fs");

cloudinary.config({ 
  cloud_name: config.cloudinaryName,
  api_key: config.cloudinaryKey,
  api_secret: config.cloudinarySecret
});


var exports = module.exports = {};

exports.uploadImage = async (path, folder, entityId, options) => {
  return new Promise(async (resolve, reject) => {
    if(options){
      if(options.toPng && pathLib.extname(path) == '.png'){
        let buffer = fs.readFileSync(path);
        let output = await pngToJpeg({quality: 90})(buffer);
        fs.unlinkSync(path)
        path = path.replace(pathLib.extname(path),'.jpg');
        fs.writeFileSync(path , output)
      }
    }
    cloudinary.uploader.upload(path, { folder : `${folder}/${entityId}` },
      function(error, result) {
          fs.unlinkSync(path)
          if(error) reject(error);
          else resolve({
            id: crypto.randomBytes(6).toString('hex'),
            cloudinaryId: result.public_id,
            url: result.secure_url,
            createdAt:  result.created_at,
            isMainImage: false
          });
        });
  });
}
exports.deleteImage = async (id) => {
    return new Promise((resolve, reject) => {
      cloudinary.uploader.destroy(id, function(error,result) {
        if(error) reject(error);
        else resolve(result);
    });
  });
}