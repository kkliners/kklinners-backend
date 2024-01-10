const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const bookedServicesSchema = new Schema({
  user: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  service: {
    type: Schema.Types.ObjectId,
    ref: 'Service',
    required: true,
  },
  bookingDate: {
    type: Date,
    required: true,
  },
  // Additional properties for the booked service
  duration: {
    type: Number, // Duration in minutes or hours, as needed
  },
  location: {
    type: String, // Service location (e.g., address)
  },
  price: {
    type: Number, // Total price of the service
  },
  paymentStatus: {
    type: String, // Payment status (e.g., 'paid', 'pending', 'failed')
  },
  // Add more properties as needed
});

const BookedService = mongoose.model('BookedService', bookedServicesSchema);

module.exports = BookedService;
