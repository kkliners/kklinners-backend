const mongoose = require('mongoose');

const cleaningServiceSchema = new mongoose.Schema({
  userID: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User', // Reference to the User collection
    required: true
  },
  serviceName: {//for examble moving ,cleaning,laundery
    type: String,
    required: true
  },
  serviceDescription: {//standard cleaning,deep cleaning,move-in cleaning,office cleaning etc
    type: String,
    required: true
  },
  serviceRate: { // Include a field to store the calculated rate
    type: Number
  },
  areas: ['Bedroom', 'Living Room', 'Kitchen', 'Bathroom','Terrace','Dining Room','Garage']
  // Array of area names
});

const CleaningService = mongoose.model('CleaningService', cleaningServiceSchema);

module.exports = CleaningService;
