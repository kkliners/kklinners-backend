const User = require('../model/user')
const asyncHandler = require('express-async-handler');
const Service = require('../model/cleaningService');
const { Error } = require('mongoose');
const calculateServiceRate = require('../utils/calculateRate')
const https = require('https');
const axios = require('axios');
  
  
class PaymentError extends Error {
  constructor(message) {
    super(message);
    this.name = 'PaymentError';
  }
}

//Note,when a service have been posted,so to pay,you go to the db and check the payment price generated and if the money you inputed aint complete then it gets rejected 
//create different cleaning space price based on the the type of cleaning generated eg deep,light,office,cleaning

const paystackPayment = asyncHandler(async (req, res) => {
  try {
    const { email, amount } = req.body;

    const response = await axios.post('https://api.paystack.co/transaction/initialize', {
      email,
      amount,
    }, {
      headers: {
        Authorization: 'Bearer sk_test_404411a98099866d1972d924fea7d3503e83b9d0', // Replace with your actual key
        'Content-Type': 'application/json',
      },
    });

    const responseData = response.data;
    console.log(responseData);

    if (responseData.status && responseData.data) {
      const authorizationURL = responseData.data.authorization_url;
      const accessCode = responseData.data.access_code;
      const reference = responseData.data.reference;

      res.json({
        status: true,
        message: 'Authorization URL created',
        data: {
          authorization_url: authorizationURL,
          access_code: accessCode,
          reference: reference,
        },
      });
    } else {
      res.status(500).json({ error: 'Internal Server Error' });
    }
  } catch (error) {
    console.error('Error processing Paystack payment:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});



//
 


const createCleaningService = asyncHandler(async (req, res) => {
    try {
      const { id, serviceName, serviceCategory, areas, bookingDate, bookingTime, location  } = req.body;
      const paymentStatus = 'pending'
      // Check if the payment status is successful
      if (paymentStatus !== 'pending') {
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
  


  //Get all User's Service
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



//Get a Single Service

  const getSingleService = asyncHandler(async (req, res) => {
    const userId = req.params.userId; // Assuming userId is passed as a parameter
    const serviceId = req.params.serviceId;

    try {
        // Fetch the service for the given userId and serviceId
        const service = await Service.findOne({ user_id: userId, _id: serviceId });

        if (!service) {
            return res.status(404).json({ message: 'Service not found' });
        }

        // Respond with the single service
        res.status(200).json({ service });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Internal Server Error' });
    }
});


//User cancelled Service services
const cancelService = asyncHandler(async (req, res) => {
  const serviceId = req.params.serviceId;
  const { cancellationReason } = req.body;

  try {
    // Find the service by ID
    const service = await Service.findById(serviceId);

    // Check if the service exists
    if (!service) {
      return res.status(404).json({ message: 'Cleaning service not found' });
    }

    // Check if the service is cancellable (e.g., payment status is pending)
    if (service.booking.paymentStatus !== 'pending') {
      return res.status(400).json({ message: 'Cannot cancel a completed or ongoing service' });
    }

    // Update the service with the cancellation reason and set the cancellation status
    service.booking.cancelled = 'cancel';
    service.booking.cancellationReason = cancellationReason;

    // Save the updated service to the database
    await service.save();

    // Respond with a success message or the updated cleaning service
    res.status(200).json({ message: 'Cleaning service canceled successfully', cleaningService: service });
  } catch (error) {
    console.error(error.message);
    res.status(500).json({ message: 'Internal Server Error' });
  }
});

//Get a specific User Canceled Services
const userCancelledServices = asyncHandler(async(req,res)=>{
  const userId = req.params.userId;

  try {
    // Find all canceled services for the user
    const cancelledServices = await Service.find({
      'user_id': userId,
      'booking.cancelled': 'cancel',
    });

    // Respond with the list of canceled services
    res.status(200).json({ cancelledServices });
  } catch (error) {
    console.error(error.message);
    res.status(500).json({ message: 'Internal Server Error' });
  }
})
// Export the route handler

module.exports = { createCleaningService,getUserServices ,getSingleService,paystackPayment,cancelService,userCancelledServices};
