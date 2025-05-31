// controller/bookingCtrl.js
const User = require("../model/user");
const asyncHandler = require("express-async-handler");
const Service = require("../model/cleaningService");
const { Error } = require("mongoose");
const calculateServiceRate = require("../utils/calculateRate");
const paystackService = require("../services/paystackService");

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

// Enhanced createCleaningService with improved error handling
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

    // Find user
    const user = await User.findOne({ user_id });
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Calculate service rate
    const serviceRate = calculateServiceRate(areas);

    // Generate unique reference
    const reference = paystackService.generateReference("BOOKING");

    // Create service entry FIRST
    const newService = new Service({
      user_id: user.user_id,
      serviceName,
      serviceCategory,
      areas,
      serviceRate,
      booking: {
        bookingDate: new Date(bookingDate),
        bookingTime,
        location,
        paymentStatus: "pending",
        payment: {
          reference,
          amount: serviceRate,
          currency: "NGN",
        },
      },
    });

    await newService.save();
    console.log("Service created with ID:", newService._id);

    // Initialize Paystack payment using the enhanced service
    const paymentData = await paystackService.initializeTransaction({
      email: user.email,
      amount: serviceRate, // Service handles kobo conversion
      reference: reference,
      callback_url: `${process.env.FRONTEND_URL}/booking-confirmation?reference=${reference}`,
      metadata: {
        service_id: newService._id.toString(),
        user_id: user_id,
        booking_type: "cleaning_service",
        areas: areas,
        booking_date: bookingDate,
        booking_time: bookingTime,
        location: location,
      },
    });

    if (!paymentData.status) {
      // If payment initialization fails, delete the service
      await Service.findByIdAndDelete(newService._id);
      throw new Error(paymentData.message || "Payment initialization failed");
    }

    // Update service with Paystack details
    newService.booking.payment.authorization_url =
      paymentData.data.authorization_url;
    newService.booking.payment.access_code = paymentData.data.access_code;
    newService.booking.payment.paystack_reference = paymentData.data.reference;
    await newService.save();

    return res.status(201).json({
      success: true,
      message: "Service booked successfully. Please complete payment.",
      data: {
        cleaningService: newService,
        payment: {
          authorization_url: paymentData.data.authorization_url,
          access_code: paymentData.data.access_code,
          reference: reference,
        },
      },
    });
  } catch (error) {
    console.error("Book Service Error:", error.message || error);

    // Handle specific Paystack errors
    if (error.message.includes("Invalid Paystack API key")) {
      return res.status(500).json({
        success: false,
        message: "Payment service configuration error",
      });
    } else if (error.message.includes("Bad Request")) {
      return res.status(400).json({
        success: false,
        message: "Invalid payment data. Please check your details.",
      });
    } else if (
      error.message.includes("timeout") ||
      error.message.includes("Network")
    ) {
      return res.status(503).json({
        success: false,
        message: "Payment service temporarily unavailable. Please try again.",
      });
    }

    next(error);
  }
};

// Enhanced verifyPayment with better error handling
const verifyPayment = async (req, res, next) => {
  try {
    const { reference } = req.body;

    if (!reference) {
      return res.status(400).json({
        success: false,
        message: "Transaction reference is required",
      });
    }

    console.log(`Starting verification for reference: ${reference}`);

    // Check if already verified (prevent duplicate processing)
    const existingService = await Service.findOne({
      "booking.payment.reference": reference,
      "booking.paymentStatus": "paid",
    });

    if (existingService) {
      return res.status(200).json({
        success: true,
        message: "Payment already verified",
        data: existingService,
      });
    }

    // Verify payment with Paystack using the enhanced service
    const verificationData = await paystackService.verifyTransaction(reference);

    if (!verificationData.status) {
      return res.status(400).json({
        success: false,
        message: verificationData.message || "Payment verification failed",
      });
    }

    const paymentData = verificationData.data;

    if (paymentData.status !== "success") {
      return res.status(400).json({
        success: false,
        message: "Payment not successful",
        payment_status: paymentData.status,
      });
    }

    // Find the service linked to this payment reference
    const service = await Service.findOne({
      "booking.payment.reference": reference,
    });

    if (!service) {
      console.error(`Service not found for reference: ${reference}`);
      return res.status(404).json({
        success: false,
        message: "Service not found for this transaction",
      });
    }

    // Security check: Verify amount matches
    const expectedAmount = paystackService.toKobo(service.serviceRate);
    if (paymentData.amount !== expectedAmount) {
      console.error(
        `Amount mismatch. Expected: ${expectedAmount}, Got: ${paymentData.amount}`
      );
      return res.status(400).json({
        success: false,
        message: "Payment amount does not match service cost",
      });
    }

    // Update payment status with verification details
    service.booking.paymentStatus = "paid";
    service.booking.payment.verified_at = new Date();
    service.booking.payment.paystack_transaction_id = paymentData.id.toString();
    service.booking.payment.paid_amount = paystackService.fromKobo(
      paymentData.amount
    );
    service.booking.payment.payment_method = paymentData.channel;
    service.booking.payment.gateway_response = paymentData.gateway_response;
    service.booking.payment.paid_at = new Date(paymentData.paid_at);

    await service.save();
    console.log(`Payment verified successfully for service: ${service._id}`);

    // Optional: Send confirmation notification
    await sendBookingConfirmation(service);

    return res.status(200).json({
      success: true,
      message: "Payment verified successfully",
      data: {
        service_id: service._id,
        payment_status: service.booking.paymentStatus,
        reference: reference,
        verified_at: service.booking.payment.verified_at,
        amount_paid: service.booking.payment.paid_amount,
        payment_method: service.booking.payment.payment_method,
      },
    });
  } catch (error) {
    console.error("Verify Payment Error:", error.message || error);

    // Handle specific Paystack errors
    if (error.message.includes("Transaction not found")) {
      return res.status(404).json({
        success: false,
        message: "Transaction not found. Please contact support.",
      });
    } else if (error.message.includes("timeout")) {
      return res.status(408).json({
        success: false,
        message: "Payment verification timeout. Please try again.",
      });
    } else if (error.message.includes("Network")) {
      return res.status(503).json({
        success: false,
        message: "Network error. Please try again.",
      });
    }

    return res.status(500).json({
      success: false,
      message: "Payment verification failed. Please try again.",
    });
  }
};

// Enhanced paystackPayment function using the service
const paystackPayment = asyncHandler(async (req, res, next) => {
  try {
    const { email, amount } = req.body;

    if (!email || !amount) {
      return res.status(400).json({
        success: false,
        message: "Email and amount are required",
      });
    }

    // Use the enhanced Paystack service
    const paymentResponse = await paystackService.initializeTransaction({
      email,
      amount,
    });

    if (paymentResponse.status && paymentResponse.data) {
      const { authorization_url, access_code, reference } =
        paymentResponse.data;

      return sendResponse(res, 200, true, "Authorization URL created", {
        authorization_url,
        access_code,
        reference,
      });
    } else {
      throw new PaymentError("Payment initialization failed", 500);
    }
  } catch (error) {
    console.error("Error processing Paystack payment:", error);
    next(error);
  }
});

// Webhook handler for Paystack events
const handlePaystackWebhook = async (req, res) => {
  try {
    const signature = req.headers["x-paystack-signature"];
    const payload = JSON.stringify(req.body);

    // Verify webhook signature
    if (!paystackService.validateWebhook(payload, signature)) {
      return res.status(400).json({ error: "Invalid signature" });
    }

    const event = req.body;
    console.log("Webhook received:", event.event);

    switch (event.event) {
      case "charge.success":
        await handleSuccessfulPayment(event.data);
        break;

      case "charge.failed":
        await handleFailedPayment(event.data);
        break;

      case "charge.pending":
        await handlePendingPayment(event.data);
        break;

      default:
        console.log(`Unhandled webhook event: ${event.event}`);
    }

    res.status(200).json({ message: "Webhook processed successfully" });
  } catch (error) {
    console.error("Webhook error:", error);
    res.status(500).json({ error: "Webhook processing failed" });
  }
};

// Helper functions for webhook processing
const handleSuccessfulPayment = async (paymentData) => {
  const { reference } = paymentData;

  try {
    const service = await Service.findOne({
      "booking.payment.reference": reference,
    });

    if (service && service.booking.paymentStatus !== "paid") {
      service.booking.paymentStatus = "paid";
      service.booking.payment.webhook_verified_at = new Date();
      service.booking.payment.paystack_transaction_id =
        paymentData.id.toString();
      await service.save();

      console.log(`Webhook: Payment confirmed for service ${service._id}`);
      await sendBookingConfirmation(service);
    }
  } catch (error) {
    console.error("Error processing successful payment webhook:", error);
  }
};

const handleFailedPayment = async (paymentData) => {
  const { reference } = paymentData;

  try {
    const service = await Service.findOne({
      "booking.payment.reference": reference,
    });

    if (service) {
      service.booking.paymentStatus = "failed";
      service.booking.payment.failure_reason = paymentData.gateway_response;
      await service.save();

      console.log(`Webhook: Payment failed for service ${service._id}`);
    }
  } catch (error) {
    console.error("Error processing failed payment webhook:", error);
  }
};

const handlePendingPayment = async (paymentData) => {
  const { reference } = paymentData;

  try {
    const service = await Service.findOne({
      "booking.payment.reference": reference,
    });

    if (service) {
      service.booking.paymentStatus = "pending";
      await service.save();

      console.log(`Webhook: Payment pending for service ${service._id}`);
    }
  } catch (error) {
    console.error("Error processing pending payment webhook:", error);
  }
};

// Helper function for sending booking confirmation
const sendBookingConfirmation = async (service) => {
  // TODO: Implement email/SMS notification
  console.log(`Sending confirmation for booking: ${service._id}`);
};

// Get all User's Service
const getUserServices = asyncHandler(async (req, res, next) => {
  const user_id = req.params.user_id;
  const userServices = await Service.find({ user_id });

  if (userServices.length === 0) {
    res.status(404);
    throw new Error("No services found for the user");
  }

  return sendResponse(
    res,
    200,
    true,
    "All user services retrieved successfully",
    userServices
  );
});

// Get a Single Service
const getSingleService = asyncHandler(async (req, res, next) => {
  const { user_id, service_id } = req.params;

  const service = await Service.findOne({ user_id, service_id });

  if (!service) {
    res.status(404);
    throw new Error("Service not found");
  }

  return sendResponse(
    res,
    200,
    true,
    "User service retrieved successfully",
    service
  );
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

  return sendResponse(
    res,
    200,
    true,
    "Cleaning service canceled successfully",
    service
  );
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
    cancelledServices.length
      ? "Cancelled services retrieved successfully"
      : "No cancelled services found for this user",
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
    upcomingServices.length
      ? "Upcoming services retrieved successfully"
      : "No upcoming services found",
    upcomingServices
  );
});

// Get all completed services
const getAllCompletedServices = asyncHandler(async (req, res, next) => {
  const completedServices = await Service.find({
    "booking.progress": "completed",
  });

  return sendResponse(
    res,
    200,
    true,
    completedServices.length
      ? "Completed services retrieved successfully"
      : "No completed services found",
    completedServices
  );
});

// Get all pending services
const getAllPendingServices = asyncHandler(async (req, res, next) => {
  const pendingServices = await Service.find({
    "booking.paymentStatus": "pending",
  });

  return sendResponse(
    res,
    200,
    true,
    pendingServices.length
      ? "Pending services retrieved successfully"
      : "No pending services found",
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
    userPendingServices.length
      ? "User pending services retrieved successfully"
      : "No pending services found for this user",
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
    userUpcomingServices.length
      ? "User upcoming services retrieved successfully"
      : "No upcoming services found for this user",
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
    userCompletedServices.length
      ? "User completed services retrieved successfully"
      : "No completed services found for this user",
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
  handlePaystackWebhook, // Add this for webhook handling
};
