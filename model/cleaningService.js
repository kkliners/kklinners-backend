const mongoose = require('mongoose');
const uuid = require('uuid');

const cleaningServiceSchema = new mongoose.Schema({
    service_id: {
        type: String,
        default: () => `Service-${uuid.v4()}`, // Using a function to concatenate prefix and UUID
        unique: true,
    }, 
  user_id: {
      type: String,
      ref: 'User', // Reference to the User collection
      required: true
  },
  serviceName: {
      type: String,
      required: true
  },
  serviceCategory: {
      type: String,
      required: true
  },
  serviceRate: {
      type: Number
  },
  areas: ['Bedroom', 'Living Room', 'Kitchen', 'Bathroom', 'Terrace', 'Dining Room', 'Garage'],
  booking: {
      bookingDate: {
          type: Date,
          required: true,
      },
      bookingTime: {
          type: String, // Change the type to String
          required: true,
      },
      location: {
          type: String,
      },
      paymentStatus: {
          type: String,
          enum: ['pending', 'paid', 'failed'],
          default: 'pending',
      },
      progress:{
        type:String,
        enum: ['pending', 'completed', 'cancel'],
          default: 'pending',
      },
      cancellationReason: {
        type: String,
      },
  }
},{
    timestamps: true 
});

const Service = mongoose.model('Service', cleaningServiceSchema);

module.exports = Service;

