const cloudinary = require('cloudinary').v2

// Configure cloudinary
cloudinary.config({
  cloud_name: 'diemc336d',
  api_key: '623342495557489',
  api_secret: 'QMsg4GL5gQlUq42nDmekj9rpSXY',
});



module.exports = cloudinary;



// cloudinary.v2.api
//   .update('Image-name', { 
//     resource_type: 'image',
//     type: 'upload',
//     tags: 'cat' })
//   .then(console.log);    

