const mongoose = require('mongoose');

const pinSchema = new mongoose.Schema({
  user_id: {
    type: String, // Assuming user_id in userSchema is of type String
    ref: 'User', // Reference the 'User' model
    required: true,
  },
  pin: {
    type: String, // Change the type to String to match the validator
    required: true,
    validate: {
      validator: (value) => /^\d{4}$/.test(value), // Enforce exact 4-digit PIN
      message: 'PIN must be 4 digits',
    },
  },
});

module.exports = mongoose.model('Pin', pinSchema);

