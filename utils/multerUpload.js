const multer = require('multer');

const storage = multer.memoryStorage({
  filename: function (req, file, cb) {
    cb(null, file.originalname); // Fix: Call cb with null as the first argument
  },
});

const upload = multer({ storage: storage });

module.exports = upload;
