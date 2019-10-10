const axios = require('axios');
const fs = require('fs');
const imageSize = require('image-size');

class Compresser {
  constructor(cloudinary) {
    this.cloudinary = cloudinary;

    if (!fs.existsSync('temp/')){
      fs.mkdirSync('temp/');
    }
  }

  async compressUserImages(userRepository) {
    const limit = 10;
    let page = 0;
    let users = await userRepository.findPaginatedUsers(limit, page);

    while(users.length) {
      for (const user of users) {
        const { images } = user;
  
        if (!images || !images.length) continue;
        
        for (const image of images) {
          await this.compressSingleImage(image.url);
        }
      }
      page += 1;
      console.log('compressed ', limit*page, 'users...');
      users = await userRepository.findPaginatedUsers(limit, page);
    }
  }

  async compressPlaceImages(placeRepository) {
    const limit = 10;
    let page = 0;
    let places = await placeRepository.findPaginatedPlaces(limit, page);

    while(places.length) {
      for (const place of places) {
        const { images } = place;
  
        if (!images || !images.length) continue;
        
        for (const image of images) {
          await this.compressSingleImage(image.url);
        }
      }
      page += 1;
      console.log('compressed ', limit*page, 'places...');
      places = await placeRepository.findPaginatedPlaces(limit, page);
    }
  }

  async compressSingleImage(url) {
    const [_, specific] = url.split('/upload/');
    const localId = `temp/${specific.split('/').slice(-1)[0]}`;
    await this.download_image(url, localId);

    if (this.getFileSizeMb(localId) < 1) {
      return;
    }

    const folder = specific.split('/').splice(1).slice(0, -1).join('/');
    const publicId = specific.split('/').slice(-1)[0].split('.').shift();

    const uploadParams = {
      public_id: publicId,
      folder,
      crop: 'scale',
      format: 'jpg',
      invalidate: true,
    };
    const { width, height } = await this.getImageDimensions(localId);
    if (width > 700) {
      uploadParams.width = 700;
    } else if (height > 1300) {
      uploadParams.height = 1300;
    }

    const result = await new Promise((resolve) => {
      this.cloudinary.uploader.upload(localId, uploadParams, (error, result) => {
        if(error) resolve();
        else resolve({
          cloudinaryId: result.public_id,
          url: result.secure_url,
          createdAt:  result.created_at,
          isMainImage: false
        });
      });
    });
    fs.unlink(localId, () => {});

    return result;
  }

  async download_image(url, image_path) {
    const response = await axios({
      url,
      responseType: 'stream',
    })
    await new Promise((resolve, reject) => {
      response.data
        .pipe(fs.createWriteStream(image_path))
        .on('finish', () => resolve())
        .on('error', e => reject(e));
    });
  }

  getFileSizeMb(path) {
    const stats = fs.statSync(path);
    const fileSizeInBytes = stats.size;
    const fileSizeInMegabytes = fileSizeInBytes / 1000000.0;

    return fileSizeInMegabytes;
  }

  getImageDimensions(path) {
    return new Promise((resolve, reject) => {
      imageSize(path, function (err, dimensions) {
        if (err) reject(err);
        resolve(dimensions);
      });
    });
  }
}

module.exports = Compresser;
