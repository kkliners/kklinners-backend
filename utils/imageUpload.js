const upload = require('../utils/multerUpload')
const cloudinary = require('./cloudinary');
class CustomError extends Error {
    constructor(message) {
        super(message);
        this.name = 'CustomError';
    }
  }

const uploadProfileImage = (req, res, next) => {
    upload.single('image')(req, res, async (multerErr) => {
      if (multerErr) {
        // Handle multer upload error
        return next(multerErr);
      }
  
      try {
        // Generate a unique identifier (demo: timestamp + random number)
        const uniqueIdentifier = `${Date.now()}_${Math.floor(Math.random() * 1000)}`;
  
        // Create a promise for Cloudinary upload
        const cloudinaryUpload = () =>
          new Promise((resolve, reject) => {
            const uploadStream = cloudinary.uploader.upload_stream(
              { public_id: uniqueIdentifier, folder: 'profileImage' },
              (err, result) => {
                if (err) {
                  reject(err);
                } else {
                  resolve(result);
                }
              }
            );
  
            // Pipe the buffer to the Cloudinary upload stream
            uploadStream.end(req.file.buffer);
          });
  
        // Upload to Cloudinary using the promise
        const cloudinaryResult = await cloudinaryUpload();
  
        // Extract the HTTP URL (url) property
        const httpUrl = cloudinaryResult.url;
  
        // Respond with the extracted HTTP URL
        console.log('done')
        res.status(201).json({
          success: true,
          message: 'User image uploaded successfully.',
          data: { url: httpUrl },
        });
      } catch (cloudinaryErr) {
        // Handle Cloudinary upload error
        console.error('Cloudinary upload error:', cloudinaryErr);
        return res.status(400).json({
          success: false,
          error: 'Image upload fails',
          details: null,
        });
      }
    });
  };
  
  module.exports = uploadProfileImage;