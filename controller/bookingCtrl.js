const User = require('../model/user')
const asyncHandler = require('express-async-handler');
const Service = require('../model/cleaningService');
const { Error } = require('mongoose');
const calculateServiceRate = require('../utils/calculateRate')

  
  
class PaymentError extends Error {
  constructor(message) {
    super(message);
    this.name = 'PaymentError';
  }
}

// Function to make Paystack payment
const https = require('https');
const querystring = require('querystring');

const paystackPayment = (amount, email) => {
  return new Promise((resolve, reject) => {
    // Set the Paystack API endpoint for initializing transactions
    const endpoint = '/transaction/initialize';

    // Construct the request payload
    const payload = {
      amount: amount * 100, // Paystack API expects the amount in kobo (multiply by 100 for naira)
      email,
      currency: 'NGN', // Set the currency (Nigerian Naira)
    };

    const options = {
      hostname: 'api.paystack.co',
      port: 443,
      path: endpoint,
      method: 'POST', // Use POST method for initializing transactions
      headers: {
        Authorization: 'Bearer sk_test_404411a98099866d1972d924fea7d3503e83b9d0',
        'Content-Type': 'application/json',
      },
    };

    const reqPaystack = https.request(options, (response) => {
      let data = '';

      response.on('data', (chunk) => {
        data += chunk;
      });

      response.on('end', () => {
        resolve(JSON.parse(data));
      });
    });

    reqPaystack.on('error', (error) => {
      reject(error);
    });

    // Write the payload as the request body
    reqPaystack.write(JSON.stringify(payload));
    reqPaystack.end();
  });
};


// Route handler to create a cleaning service
const createCleaningService = asyncHandler(async (req, res) => {
  try {
    const { id, serviceName, serviceCategory, areas, bookingDate, bookingTime, location, paymentStatus } = req.body;

    // Check if the payment status is successful
    if (paymentStatus !== 'paid') {
      throw new PaymentError('Payment unsuccessful. Please ensure your payment is successful before booking.');
    }

    // Find the user by ID
    const user = await User.findById(id);

    // Handle user not found
    if (!user) {
      return res.status(404).json({
        error: 'User not found',
        message: 'The provided user ID does not correspond to any registered user. Please double-check your user ID or register a new account.',
      });
    }

    // Calculate the service rate based on the selected areas
    const serviceRate = calculateServiceRate(areas);

    // Make Paystack payment
    const paystackResponse = await paystackPayment(serviceRate);

    // Use paystackResponse and serviceRate as needed in your logic
    console.log('Paystack Response:', paystackResponse);

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

// Your other existing code...


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


// Export the route handler

module.exports = { createCleaningService,getUserServices ,getSingleService,paystackPayment};
