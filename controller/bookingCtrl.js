const User = require('../model/user')
const asyncHandler = require('express-async-handler');
const Service = require('../model/cleaningService');
const { Error } = require('mongoose');
const calculateServiceRate = require('../utils/calculateRate')
const https = require('https');
const axios = require('axios');
class CustomError extends Error {
  constructor(message) {
      super(message);
      this.name = 'CustomError';
  }
}
//make sure when the price is generated it is then parsed in paystack amount to be paid
  
// class PaymentError extends Error {
//   constructor(message) {
//     super(message);
//     this.name = 'PaymentError';
//   }
// }

//Note,when a service have been posted,so to pay,you go to the db and check the payment price generated and if the money you inputed aint complete then it gets rejected 
//create different cleaning space price based on the the type of cleaning generated eg deep,light,office,cleaning

// const paystackPayment = asyncHandler(async (req, res) => {
//   try {
//     const { email, amount } = req.body;

//     const response = await axios.post('https://api.paystack.co/transaction/initialize', {
//       email,
//       amount:serviceRate,
//     }, {
//       headers: {
//         Authorization: 'Bearer sk_test_404411a98099866d1972d924fea7d3503e83b9d0', // Replace with your actual key
//         'Content-Type': 'application/json',
//       },
//     });

//     const responseData = response.data;
//     console.log(responseData);

//     if (responseData.status && responseData.data) {
//       const authorizationURL = responseData.data.authorization_url;
//       const accessCode = responseData.data.access_code;
//       const reference = responseData.data.reference;

//       res.json({
//         status: true,
//         message: 'Authorization URL created',
//         data: {
//           authorization_url: authorizationURL,
//           access_code: accessCode,
//           reference: reference,
//         },
//       });
//     } else {
//       res.status(500).json({ error: 'Internal Server Error' });
//     }
//   } catch (error) {
//     console.error('Error processing Paystack payment:', error);
//     res.status(500).json({ error: 'Internal Server Error' });
//   }
// });

// const createCleaningService = asyncHandler(async (req, res) => {
//     try {
//       const { id, serviceName, serviceCategory, areas, bookingDate, bookingTime, location  } = req.body;
//       const paymentStatus = 'pending'
//       // Check if the payment status is successful
//       if (paymentStatus !== 'pending') {
//         throw new PaymentError('Payment unsuccessful');
//       }
  
//       const user = await User.findById(id);
  
//       // Calculate the service rate based on the selected areas
//       const serviceRate = calculateServiceRate(areas);
  
//       // Create a new CleaningService instance
//       const newCleaningService = new Service({
//         user_id: user.id,
//         serviceName,
//         serviceCategory,
//         areas,
//         serviceRate,
//         booking: {
//           bookingDate,
//           bookingTime,
//           location,
//           paymentStatus,
//         },
//         // other fields as needed
//       });
  
//       // Save the new cleaning service to the database
//       await newCleaningService.save();
  
//       // Respond with a success message or the created cleaning service
//       res.status(201).json({ message: 'Cleaning service created and booked successfully', cleaningService: newCleaningService });
//     } catch (error) {
//       // Handle custom errors
//       if (error instanceof PaymentError) {
//         return res.status(400).json({ message: error.message }); // Respond with a 400 Bad Request for payment errors
//       }
  
//       // Handle other errors
//       console.error(error.message); // Log the error message
//       res.status(500).json({ message: 'Internal Server Error' });
//     }
//   });
  
class PaymentError extends Error {
  constructor(message) {
    super(message);
    this.name = 'PaymentError';
  }
}

// Paystack configuration
const paystackConfig = {
  secretKey: 'sk_test_404411a98099866d1972d924fea7d3503e83b9d0', // Replace with your actual key
};

const paystackHeaders = {
  Authorization: `Bearer ${paystackConfig.secretKey}`,
  'Content-Type': 'application/json',
};

// Paystack payment endpoint
const paystackPaymentURL = 'https://api.paystack.co/transaction/initialize';

// Function to initiate Paystack payment
const initiatePaystackPayment = async (email, amount) => {
  const response = await axios.post(paystackPaymentURL, { email, amount }, { headers: paystackHeaders });
  return response.data;
};

const paystackPayment = asyncHandler(async (req, res, next) => {
  try {
    const { email, amount } = req.body;

    // Call Paystack to initialize payment
    const paymentResponse = await initiatePaystackPayment(email, amount);

    if (paymentResponse.status && paymentResponse.data) {
      const { authorization_url, access_code, reference } = paymentResponse.data;

      res.status(200).json({
        success: true,
        message: 'Authorization URL created',
        data: {
          authorization_url,
          access_code,
          reference,
        },
      });
    } else {
      next(new CustomError('Internal Server Error', 500));
    }
  } catch (error) {
    console.error('Error processing Paystack payment:', error);
    console.error(error.message); // Log the error message
    next(error);
  }
});


const createCleaningService = asyncHandler(async (req, res, next) => {
  try {
    const { user_id, serviceName, serviceCategory, areas, bookingDate, bookingTime, location } = req.body;
    const paymentStatus = 'pending';

    // Check if the payment status is successful
    if (paymentStatus !== 'pending') {
      throw new PaymentError('Payment unsuccessful');
    }

    const user = await User.findOne({user_id});

    // Calculate the service rate based on the selected areas
    const serviceRate = calculateServiceRate(areas);

    // Call Paystack to get the payment link
    const paymentResponse = await initiatePaystackPayment(user.email, serviceRate * 100); // Convert to kobo

    if (paymentResponse.status && paymentResponse.data) {
      const { authorization_url, access_code, reference } = paymentResponse.data;

      // Create a new CleaningService instance
      const newCleaningService = new Service({
        user_id: user.user_id,
        serviceName,
        serviceCategory,
        areas,
        serviceRate,
        booking: {
          bookingDate,
          bookingTime,
          location,
          paymentStatus,
          payment: {
            authorization_url,
            access_code,
            reference,
          },
        },
        // other fields as needed
      });

      // Save the new cleaning service to the database
      await newCleaningService.save();

      // Respond with the success message, cleaning service details, and payment information
      res.status(201).json({
        success: true,
        message: 'Cleaning service created and booked successfully',
        data: {
          cleaningService: newCleaningService,
          payment: {
            authorization_url,
            access_code,
            reference,
          },
        },
      });
    } else {
      next(new CustomError('Internal Server Error', 500));
    }
  } catch (error) {
    // Handle custom errors
    if (error instanceof PaymentError) {
      return res.status(400).json({ success: false, message: error.message }); // Respond with a 400 Bad Request for payment errors
    }

    // Handle other errors
    console.error(error.message); // Log the error message
    next(error);
  }
});



 // Get all User's Service
const getUserServices = asyncHandler(async (req, res, next) => {
  const user_id = req.params.user_id;

  try {
    // Fetch services for the given user_id
    const userServices = await Service.find({ user_id: user_id });

    if (userServices.length === 0) {
      next(new CustomError('No services found for the user', 404));
    }

    // Respond with the user's services
    res.status(200).json({ success: true,message: 'All user Services', data: { userServices } });
  } catch (error) {
    console.error(error.message); // Log the error message
    next(error);
  }
});




//Get a Single Service

const getSingleService = asyncHandler(async (req, res, next) => {
  const user_id = req.params.user_id; // Assuming user_id is passed as a parameter
  const service_id = req.params.service_id;

  try {
    // Fetch the service for the given user_id and service_id
    const service = await Service.findOne({ user_id: user_id,service_id : service_id });

    if (!service) {
      next(new CustomError('Service not found', 404));
    }

    // Respond with the single service
    res.status(200).json({ success: true,message: 'User Service', data: { service } });
  } catch (error) {
    console.error(error.message); // Log the error message
    next(error);
  }
});


//User cancelled Service services
const cancelService = asyncHandler(async (req, res, next) => {
  const service_id = req.params.service_id;
  const { cancellationReason } = req.body;

  try {
    // Find the service by ID
    const service = await Service.findOne({service_id});

    // Check if the service exists
    if (!service) {
      next(new CustomError('Cleaning service not found', 404));
    }

    // Check if the service is cancellable (e.g., payment status is pending)
    if (service.booking.paymentStatus !== 'pending') {
      next(new CustomError('Cannot cancel a completed or ongoing service', 400));
    }

    // Update the service with the cancellation reason and set the cancellation status
    service.booking.progress = 'cancel';
    service.booking.cancellationReason = cancellationReason;

    // Save the updated service to the database
    await service.save();

    // Respond with a success message or the updated cleaning service
    res.status(200).json({ success: true, message: 'Cleaning service canceled successfully', data: { cleaningService: service } });
  } catch (error) {
    console.error(error.message); // Log the error message
    next(error);
  }
});

//Get a specific User Canceled Services
const userCancelledServices = asyncHandler(async (req, res, next) => {
  const user_id = req.params.user_id;

  try {
    // Find all canceled services for the user
    const cancelledServices = await Service.find({
      'user_id': user_id,
      'booking.progress': 'cancel',
    });

    // Respond with the list of canceled services
    res.status(200).json({ success: true, message: 'Cancelled services retrieved successfully', data: { cancelledServices } });
  } catch (error) {
    console.error(error.message);
    next(error);
  }
});
// Export the route handler


// Get all upcoming services
const getAllUpcomingServices = asyncHandler(async (req, res, next) => {
  try {
    const currentDate = new Date();

    // Find all services with booking dates in the future
    const upcomingServices = await Service.find({
      'booking.bookingDate': { $gte: currentDate },
      'booking.progress': { $nin: ['cancel', 'completed'] }, // Exclude canceled and completed services
    });

    // Respond with the list of upcoming services
    res.status(200).json({ success: true, message: 'Upcoming services retrieved successfully', data: { upcomingServices } });
  } catch (error) {
    console.error(error.message);
    next(error);
  }
});



// Get all completed services
const getAllCompletedServices = asyncHandler(async (req, res, next) => {
  try {
    // Find all services with progress 'completed'
    const completedServices = await Service.find({ 'booking.progress': 'completed' });

    // Respond with the list of completed services
    res.status(200).json({ success: true, message: 'Completed services retrieved successfully', data: { completedServices } });
  } catch (error) {
    
    console.error(error.message);
    next(error);
  }
});



// Get all pending services
const getAllPendingServices = asyncHandler(async (req, res, next) => {
  try {
    // Find all services with payment status 'pending'
    const pendingServices = await Service.find({ 'booking.paymentStatus': 'pending' });

    // Respond with the list of pending services
    res.status(200).json({ success: true, message: 'Pending services retrieved successfully', data: { pendingServices } });
  } catch (error) {
    console.error(error.message);
    next(error);
  }
});




// Controller function to get all pending services for a specific user
const getUserPendingServices = asyncHandler(async (req, res, next) => {
  const user_id = req.params.user_id;
console.log(user_id)
  try {
    const userPendingServices = await Service.find({
      'user_id': user_id,
      'booking.progress': 'pending',
    });

    res.status(200).json({ success: true, message: 'User pending services retrieved successfully', data: { userPendingServices } });
  } catch (error) {
    console.error(error.message);
    next(error);
  }
});


// Controller function to get all upcoming services for a specific user
const getUserUpcomingServices = asyncHandler(async (req, res, next) => {
  const user_id = req.params.user_id;

  try {
    const currentDate = new Date();
    const userUpcomingServices = await Service.find({
      'user_id': user_id,
      'booking.bookingDate': { $gte: currentDate },
      'booking.progress': { $nin: ['cancel', 'completed'] },
    });

    res.status(200).json({ success: true, message: 'User upcoming services retrieved successfully', data: { userUpcomingServices } });
  } catch (error) {
    console.error(error.message);
    next(error);
  }
});

const markTaskCompleted = asyncHandler(async (req, res, next) => {
  const service_id = req.params.service_id;

  try {
    // Find the task by ID and update its progress to "completed"
    const updatedTask = await Service.findOneAndUpdate(service_id, { 'booking.progress': 'completed' }, { new: true });

    // If the task was not found, return a 404 response
    if (!updatedTask) {
      return res.status(404).json({ success: false, message: 'Task not found.' });
    }

    // Return the updated task as a JSON response
    res.status(200).json({ success: true, message: 'Task progress updated to completed successfully', data: { updatedTask } });
  } catch (error) {
    console.error(error.message);
    // If an error occurs, return a 500 response
    next(new CustomError('Internal Server Error', 500));
  }
});




// Controller function to get all completed services for a specific user
const getUserCompletedServices = asyncHandler(async (req, res, next) => {
  const user_id = req.params.user_id;

  try {
    const userCompletedServices = await Service.find({
      'user_id': user_id,
      'booking.progress': 'completed',
    });
    
    if (userCompletedServices.length === 0) {
      return res.status(404).json({ success: false, message: 'No completed services found for the user.' });
    }

    res.status(200).json({ success: true, message: 'User completed services retrieved successfully', data: { userCompletedServices } });
  } catch (error) {
    console.error(error.message);
    next(new CustomError('Internal Server Error', 500));
  }
});

module.exports = { createCleaningService,getUserServices ,getSingleService,paystackPayment,cancelService,userCancelledServices,getAllCompletedServices,getAllUpcomingServices,getAllPendingServices,getUserCompletedServices,getUserUpcomingServices,getUserPendingServices,markTaskCompleted};
