var cloudinary = require('cloudinary').v2
var crypto = require('crypto');
var config = require('../config/index')

cloudinary.config({ 
  cloud_name: config.cloudinaryName,
  api_key: config.cloudinaryKey,
  api_secret: config.cloudinarySecret
});


var exports = module.exports = {};

exports.uploadImage = async (path, folder, entityId) => {
  return new Promise((resolve, reject) => {
    cloudinary.uploader.upload(path, {
      folder : `${folder}/${entityId}`,
      eager: [
        { format: 'jpg' },
      ],
    },
      function(error, result) {
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