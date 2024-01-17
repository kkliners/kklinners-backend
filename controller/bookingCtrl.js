const User = require('../model/user')
const asyncHandler = require('express-async-handler');
const Service = require('../model/cleaningService');
const { Error } = require('mongoose');
const calculateServiceRate = require('../utils/calculateRate')

  
  
class PaymentError extends Error {
    constructor(message) {
      super(message);
      this.customError = true; // Add a custom property to identify the custom error
    }
  }
  
  
  const createCleaningService = asyncHandler(async (req, res) => {
    try {
      const { id, serviceName, serviceCategory, areas, bookingDate, bookingTime, location, paymentStatus } = req.body;
  
      // Check if the payment status is successful
      if (paymentStatus !== 'paid') {
        throw new PaymentError('Payment unsuccessful');
      }
  
      const user = await User.findById(id);
  
      // Calculate the service rate based on the selected areas
      const serviceRate = calculateServiceRate(areas);
  
      // Create a new CleaningService instance
      const newCleaningService = new Service({
        user_id: user.id,
        serviceName,
        serviceCategory,
        areas,
        serviceRate,
        booking: {
          bookingDate,
          bookingTime,
          location,
          paymentStatus,
        },
        // other fields as needed
      });
  
      // Save the new cleaning service to the database
      await newCleaningService.save();
  
      // Respond with a success message or the created cleaning service
      res.status(201).json({ message: 'Cleaning service created and booked successfully', cleaningService: newCleaningService });
    } catch (error) {
      // Handle custom errors
      if (error instanceof PaymentError) {
        return res.status(400).json({ message: error.message }); // Respond with a 400 Bad Request for payment errors
      }
  
      // Handle other errors
      console.error(error.message); // Log the error message
      res.status(500).json({ message: 'Internal Server Error' });
    }
  });
  



  // Your API endpoint or route handler
const getUserServices = asyncHandler(async (req, res) => {
    const user_id = req.params.user_id;
  
    try {
      // Fetch services for the given user_id
      const userServices = await Service.find({ user_id: user_id });
  
      if (userServices.length === 0) {
        return res.status(404).json({ message: 'No services found for the user' });
      }
  
      // Respond with the user's services
      res.status(200).json({ userServices });
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: 'Internal Server Error' });
    }
  });
  

module.exports = { createCleaningService,getUserServices };
