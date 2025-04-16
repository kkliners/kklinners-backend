const User = require("../model/user");
const asyncHandler = require("express-async-handler");
const Service = require("../model/cleaningService");
const { Error } = require("mongoose");
const calculateServiceRate = require("../utils/calculateRate");
const axios = require("axios");

// Standardized response function
const sendResponse = (res, statusCode, success, message, data = null) => {
  return res.status(statusCode).json({
    success,
    message,
    data,
  });
};



class PaymentError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.name = "PaymentError";
    this.statusCode = statusCode;
  }
}

// Paystack configuration
const paystackConfig = {
  secretKey: "sk_test_404411a98099866d1972d924fea7d3503e83b9d0", // Replace with your actual key
};

const paystackHeaders = {
  Authorization: `Bearer ${paystackConfig.secretKey}`,
  "Content-Type": "application/json",
};

// Paystack payment endpoint
const paystackPaymentURL = "https://api.paystack.co/transaction/initialize";

// Function to initiate Paystack payment
const initiatePaystackPayment = async (email, amount) => {
  const response = await axios.post(
    paystackPaymentURL,
    { email, amount },
    { headers: paystackHeaders }
  );
  return response.data;
};

const paystackPayment = asyncHandler(async (req, res, next) => {
  try {
    const { email, amount } = req.body;

    // Call Paystack to initialize payment
    const paymentResponse = await initiatePaystackPayment(email, amount);

    if (paymentResponse.status && paymentResponse.data) {
      const { authorization_url, access_code, reference } =
        paymentResponse.data;

      return sendResponse(res, 200, true, "Authorization URL created", {
        authorization_url,
        access_code,
        reference,
      });
    } else {
      throw new CustomError("Internal Server Error", 500);
    }
  } catch (error) {
    console.error("Error processing Paystack payment:", error);
    next(error);
  }
});

const createCleaningService = asyncHandler(async (req, res, next) => {
  try {
    const {
      user_id,
      serviceName,
      serviceCategory,
      areas,
      bookingDate,
      bookingTime,
      location,
    } = req.body;
    const paymentStatus = "pending";

    // Check if the payment status is successful
    if (paymentStatus !== "pending") {
      throw new PaymentError("Payment unsuccessful");
    }

    const user = await User.findOne({ user_id });

    if (!user) {
      throw new CustomError("User not found", 404);
    }

    // Calculate the service rate based on the selected areas
    const serviceRate = calculateServiceRate(areas);

    // Call Paystack to get the payment link
    const paymentResponse = await initiatePaystackPayment(
      user.email,
      serviceRate * 100
    ); // Convert to kobo

    if (paymentResponse.status && paymentResponse.data) {
      const { authorization_url, access_code, reference } =
        paymentResponse.data;

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
      return sendResponse(
        res,
        201,
        true,
        "Cleaning service created and booked successfully",
        {
          cleaningService: newCleaningService,
          payment: {
            authorization_url,
            access_code,
            reference,
          },
        }
      );
    } else {
      throw new CustomError("Internal Server Error", 500);
    }
  } catch (error) {
    // Handle custom errors
    if (error instanceof PaymentError) {
      return sendResponse(res, error.statusCode, false, error.message, null);
    }
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
      throw new CustomError("No services found for the user", 404);
    }

    // Respond with the user's services
    return sendResponse(
      res,
      200,
      true,
      "All user services retrieved successfully",
      userServices
    );
  } catch (error) {
    next(error);
  }
});

// Get a Single Service
const getSingleService = asyncHandler(async (req, res, next) => {
  const user_id = req.params.user_id;
  const service_id = req.params.service_id;

  try {
    // Fetch the service for the given user_id and service_id
    const service = await Service.findOne({
      user_id: user_id,
      service_id: service_id,
    });

    if (!service) {
      throw new CustomError("Service not found", 404);
    }

    // Respond with the single service
    return sendResponse(
      res,
      200,
      true,
      "User service retrieved successfully",
      service
    );
  } catch (error) {
    next(error);
  }
});

// User cancelled Service
const cancelService = asyncHandler(async (req, res, next) => {
  const service_id = req.params.service_id;
  const { cancellationReason } = req.body;

  try {
    // Find the service by ID
    const service = await Service.findOne({ service_id });

    // Check if the service exists
    if (!service) {
      throw new CustomError("Cleaning service not found", 404);
    }

    // Check if the service is cancellable (e.g., payment status is pending)
    if (service.booking.paymentStatus !== "pending") {
      throw new CustomError(
        "Cannot cancel a completed or ongoing service",
        400
      );
    }

    // Update the service with the cancellation reason and set the cancellation status
    service.booking.progress = "cancel";
    service.booking.cancellationReason = cancellationReason;

    // Save the updated service to the database
    await service.save();

    // Respond with a success message and the updated cleaning service
    return sendResponse(
      res,
      200,
      true,
      "Cleaning service canceled successfully",
      service
    );
  } catch (error) {
    next(error);
  }
});

// Get a specific User Canceled Services
const userCancelledServices = asyncHandler(async (req, res, next) => {
  const user_id = req.params.user_id;

  try {
    // Find all canceled services for the user
    const cancelledServices = await Service.find({
      user_id: user_id,
      "booking.progress": "cancel",
    });

    if (cancelledServices.length === 0) {
      return sendResponse(
        res,
        200,
        true,
        "No cancelled services found for this user",
        []
      );
    }

    // Respond with the list of canceled services
    return sendResponse(
      res,
      200,
      true,
      "Cancelled services retrieved successfully",
      cancelledServices
    );
  } catch (error) {
    next(error);
  }
});

// Get all upcoming services
const getAllUpcomingServices = asyncHandler(async (req, res, next) => {
  try {
    const currentDate = new Date();

    // Find all services with booking dates in the future
    const upcomingServices = await Service.find({
      "booking.bookingDate": { $gte: currentDate },
      "booking.progress": { $nin: ["cancel", "completed"] }, // Exclude canceled and completed services
    });

    if (upcomingServices.length === 0) {
      return sendResponse(res, 200, true, "No upcoming services found", []);
    }

    // Respond with the list of upcoming services
    return sendResponse(
      res,
      200,
      true,
      "Upcoming services retrieved successfully",
      upcomingServices
    );
  } catch (error) {
    next(error);
  }
});

// Get all completed services
const getAllCompletedServices = asyncHandler(async (req, res, next) => {
  try {
    // Find all services with progress 'completed'
    const completedServices = await Service.find({
      "booking.progress": "completed",
    });

    if (completedServices.length === 0) {
      return sendResponse(res, 200, true, "No completed services found", []);
    }

    // Respond with the list of completed services
    return sendResponse(
      res,
      200,
      true,
      "Completed services retrieved successfully",
      completedServices
    );
  } catch (error) {
    next(error);
  }
});

// Get all pending services
const getAllPendingServices = asyncHandler(async (req, res, next) => {
  try {
    // Find all services with payment status 'pending'
    const pendingServices = await Service.find({
      "booking.paymentStatus": "pending",
    });

    if (pendingServices.length === 0) {
      return sendResponse(res, 200, true, "No pending services found", []);
    }

    // Respond with the list of pending services
    return sendResponse(
      res,
      200,
      true,
      "Pending services retrieved successfully",
      pendingServices
    );
  } catch (error) {
    next(error);
  }
});

// Get all pending services for a specific user
const getUserPendingServices = asyncHandler(async (req, res, next) => {
  const user_id = req.params.user_id;

  try {
    const userPendingServices = await Service.find({
      user_id: user_id,
      "booking.progress": "pending",
    });

    if (userPendingServices.length === 0) {
      return sendResponse(
        res,
        200,
        true,
        "No pending services found for this user",
        []
      );
    }

    return sendResponse(
      res,
      200,
      true,
      "User pending services retrieved successfully",
      userPendingServices
    );
  } catch (error) {
    next(error);
  }
});

// Get all upcoming services for a specific user
const getUserUpcomingServices = asyncHandler(async (req, res, next) => {
  const user_id = req.params.user_id;

  try {
    const currentDate = new Date();
    const userUpcomingServices = await Service.find({
      user_id: user_id,
      "booking.bookingDate": { $gte: currentDate },
      "booking.progress": { $nin: ["cancel", "completed"] },
    });

    if (userUpcomingServices.length === 0) {
      return sendResponse(
        res,
        200,
        true,
        "No upcoming services found for this user",
        []
      );
    }

    return sendResponse(
      res,
      200,
      true,
      "User upcoming services retrieved successfully",
      userUpcomingServices
    );
  } catch (error) {
    next(error);
  }
});

// Mark task as completed
const markTaskCompleted = asyncHandler(async (req, res, next) => {
  const service_id = req.params.service_id;

  try {
    // Find the task by ID and update its progress to "completed"
    const updatedTask = await Service.findOneAndUpdate(
      { service_id },
      { "booking.progress": "completed" },
      { new: true }
    );

    // If the task was not found, return a 404 response
    if (!updatedTask) {
      throw new CustomError("Task not found", 404);
    }

    // Return the updated task as a JSON response
    return sendResponse(
      res,
      200,
      true,
      "Task marked as completed successfully",
      updatedTask
    );
  } catch (error) {
    next(error);
  }
});

// Get all completed services for a specific user
const getUserCompletedServices = asyncHandler(async (req, res, next) => {
  const user_id = req.params.user_id;

  try {
    const userCompletedServices = await Service.find({
      user_id: user_id,
      "booking.progress": "completed",
    });

    if (userCompletedServices.length === 0) {
      return sendResponse(
        res,
        200,
        true,
        "No completed services found for this user",
        []
      );
    }

    return sendResponse(
      res,
      200,
      true,
      "User completed services retrieved successfully",
      userCompletedServices
    );
  } catch (error) {
    next(error);
  }
});

module.exports = {
  createCleaningService,
  getUserServices,
  getSingleService,
  paystackPayment,
  cancelService,
  userCancelledServices,
  getAllCompletedServices,
  getAllUpcomingServices,
  getAllPendingServices,
  getUserCompletedServices,
  getUserUpcomingServices,
  getUserPendingServices,
  markTaskCompleted,
};
