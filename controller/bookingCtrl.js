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





const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY;

// const calculateServiceRate = (areas) => {
//   return areas.length * 2000; // Example rate logic
// };

const createCleaningService = async (req, res, next) => {
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
console.log("Request Body:", req.body);
    console.log("User ID:", user_id);
    // Validate input
    if (
      !user_id ||
      !serviceName ||
      !serviceCategory ||
      !areas?.length ||
      !bookingDate ||
      !bookingTime ||
      !location
    ) {
      return res.status(400).json({
        success: false,
        message: "All fields are required",
      });
    }

    const user = await User.findOne({ user_id });
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    const serviceRate = calculateServiceRate(areas);

    // Initialize Paystack payment
    const response = await axios.post(
      "https://api.paystack.co/transaction/initialize",
      {
        email: user.email,
        amount: serviceRate * 100, // Convert to kobo
      },
      {
        headers: {
          Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
          "Content-Type": "application/json",
        },
      }
    );

    const { authorization_url, access_code, reference } = response.data.data;

    // Create service entry
    const newService = new Service({
      user_id: user.user_id,
      serviceName,
      serviceCategory,
      areas,
      serviceRate,
      booking: {
        bookingDate,
        bookingTime,
        location,
        paymentStatus: "pending",
        payment: {
          authorization_url,
          access_code,
          reference,
        },
      },
    });

    await newService.save();

    return res.status(201).json({
      success: true,
      message: "Service booked successfully",
      data: {
        cleaningService: newService,
        payment: {
          authorization_url,
          access_code,
          reference,
        },
      },
    });
  } catch (error) {
    console.error("Book Service Error:", error.message || error);
    next(error);
  }
};


const verifyPayment = async (req, res, next) => {
  try {
    const { reference } = req.body;

    if (!reference) {
      return res.status(400).json({
        success: false,
        message: "Transaction reference is required",
      });
    }

    // Verify payment with Paystack
    const response = await axios.get(
      `https://api.paystack.co/transaction/verify/${reference}`,
      {
        headers: {
          Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
          "Content-Type": "application/json",
        },
      }
    );

    const paymentData = response.data.data;

    if (paymentData.status !== "success") {
      return res.status(400).json({
        success: false,
        message: "Payment not successful",
      });
    }

    // Find the service linked to this payment reference
    const service = await Service.findOne({
      "booking.payment.reference": reference,
    });

    if (!service) {
      return res.status(404).json({
        success: false,
        message: "Service not found for this transaction",
      });
    }

    // Update payment status
    service.booking.paymentStatus = "paid";
    await service.save();

    return res.status(200).json({
      success: true,
      message: "Payment verified successfully",
      data: service,
    });
  } catch (error) {
    console.error("Verify Payment Error:", error.message || error);
    next(error);
  }
};






// Get all User's Service
const getUserServices = asyncHandler(async (req, res, next) => {
  const user_id = req.params.user_id;
  const userServices = await Service.find({ user_id });

  if (userServices.length === 0) {
    res.status(404);
    throw new Error("No services found for the user");
  }

  return sendResponse(res, 200, true, "All user services retrieved successfully", userServices);
});

// Get a Single Service
const getSingleService = asyncHandler(async (req, res, next) => {
  const { user_id, service_id } = req.params;

  const service = await Service.findOne({ user_id, service_id });

  if (!service) {
    res.status(404);
    throw new Error("Service not found");
  }

  return sendResponse(res, 200, true, "User service retrieved successfully", service);
});

// User cancelled Service
const cancelService = asyncHandler(async (req, res, next) => {
  const { service_id } = req.params;
  const { cancellationReason } = req.body;

  const service = await Service.findOne({ service_id });

  if (!service) {
    res.status(404);
    throw new Error("Cleaning service not found");
  }

  if (service.booking.paymentStatus !== "pending") {
    res.status(400);
    throw new Error("Cannot cancel a completed or ongoing service");
  }

  service.booking.progress = "cancel";
  service.booking.cancellationReason = cancellationReason;
  await service.save();

  return sendResponse(res, 200, true, "Cleaning service canceled successfully", service);
});

// Get a specific User Canceled Services
const userCancelledServices = asyncHandler(async (req, res, next) => {
  const { user_id } = req.params;

  const cancelledServices = await Service.find({
    user_id,
    "booking.progress": "cancel",
  });

  return sendResponse(
    res,
    200,
    true,
    cancelledServices.length ? "Cancelled services retrieved successfully" : "No cancelled services found for this user",
    cancelledServices
  );
});

// Get all upcoming services
const getAllUpcomingServices = asyncHandler(async (req, res, next) => {
  const currentDate = new Date();
  const upcomingServices = await Service.find({
    "booking.bookingDate": { $gte: currentDate },
    "booking.progress": { $nin: ["cancel", "completed"] },
  });

  return sendResponse(
    res,
    200,
    true,
    upcomingServices.length ? "Upcoming services retrieved successfully" : "No upcoming services found",
    upcomingServices
  );
});

// Get all completed services
const getAllCompletedServices = asyncHandler(async (req, res, next) => {
  const completedServices = await Service.find({ "booking.progress": "completed" });

  return sendResponse(
    res,
    200,
    true,
    completedServices.length ? "Completed services retrieved successfully" : "No completed services found",
    completedServices
  );
});

// Get all pending services
const getAllPendingServices = asyncHandler(async (req, res, next) => {
  const pendingServices = await Service.find({ "booking.paymentStatus": "pending" });

  return sendResponse(
    res,
    200,
    true,
    pendingServices.length ? "Pending services retrieved successfully" : "No pending services found",
    pendingServices
  );
});

// Get all pending services for a specific user
const getUserPendingServices = asyncHandler(async (req, res, next) => {
  const { user_id } = req.params;

  const userPendingServices = await Service.find({
    user_id,
    "booking.progress": "pending",
  });

  return sendResponse(
    res,
    200,
    true,
    userPendingServices.length ? "User pending services retrieved successfully" : "No pending services found for this user",
    userPendingServices
  );
});

// Get all upcoming services for a specific user
const getUserUpcomingServices = asyncHandler(async (req, res, next) => {
  const { user_id } = req.params;
  const currentDate = new Date();

  const userUpcomingServices = await Service.find({
    user_id,
    "booking.bookingDate": { $gte: currentDate },
    "booking.progress": { $nin: ["cancel", "completed"] },
  });

  return sendResponse(
    res,
    200,
    true,
    userUpcomingServices.length ? "User upcoming services retrieved successfully" : "No upcoming services found for this user",
    userUpcomingServices
  );
});

// Mark task as completed
const markTaskCompleted = asyncHandler(async (req, res, next) => {
  const { service_id } = req.params;

  const updatedTask = await Service.findOneAndUpdate(
    { service_id },
    { "booking.progress": "completed" },
    { new: true }
  );

  if (!updatedTask) {
    res.status(404);
    throw new Error("Task not found");
  }

  return sendResponse(
    res,
    200,
    true,
    "Task marked as completed successfully",
    updatedTask
  );
});

// Get all completed services for a specific user
const getUserCompletedServices = asyncHandler(async (req, res, next) => {
  const { user_id } = req.params;

  const userCompletedServices = await Service.find({
    user_id,
    "booking.progress": "completed",
  });

  return sendResponse(
    res,
    200,
    true,
    userCompletedServices.length ? "User completed services retrieved successfully" : "No completed services found for this user",
    userCompletedServices
  );
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
  verifyPayment,
  
};
