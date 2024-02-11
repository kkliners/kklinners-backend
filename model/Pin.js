const mongoose = require('mongoose');

const pinSchema = new mongoose.Schema({
  user_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
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

