const mongoose = require('mongoose');


const cleaningServiceSchema = new mongoose.Schema({
  user_id: {
      type: mongoose.Schema.Types.ObjectId,
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
     
  }
},{
    timestamps: true 
});

const Service = mongoose.model('Service', cleaningServiceSchema);

module.exports = Service;

