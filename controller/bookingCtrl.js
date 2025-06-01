const User = require("../model/user");
const asyncHandler = require("express-async-handler");
const Service = require("../model/cleaningService");
const { Error } = require("mongoose");
const calculateServiceRate = require("../utils/calculateRate");
const axios = require("axios");
const crypto = require("crypto");

// Standardized response function
const sendResponse = (res, statusCode, success, message, data = null) => {
  return res.status(statusCode).json({
    success,
    message,
    data,
  });
};

// Custom error classes
class PaymentError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.name = "PaymentError";
    this.statusCode = statusCode;
  }
}

// Environment variables
const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY;

// Paystack configuration
const paystackHeaders = {
  Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
  "Content-Type": "application/json",
};

// Create Cleaning Service with Paystack Payment
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

    console.log("🔍 Creating cleaning service for user:", user_id);
    console.log("📦 Request Body:", req.body);

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
        received: req.body,
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
    console.log("💰 Service rate calculated:", serviceRate);

    // Initialize Paystack payment
    const paystackResponse = await axios.post(
      "https://api.paystack.co/transaction/initialize",
      {
        email: user.email,
        amount: serviceRate, // Amount should already be in kobo from calculateServiceRate
        callback_url: `${process.env.FRONTEND_URL}/payment/callback`,
        metadata: {
          user_id: user.user_id,
          service_type: serviceName,
          areas: areas.join(", "),
          booking_date: bookingDate,
          booking_time: bookingTime,
        },
      },
      {
        headers: paystackHeaders,
      }
    );

    const { authorization_url, access_code, reference } =
      paystackResponse.data.data;
    console.log("💳 Paystack payment initialized:", reference);

    // Create service entry
    const newService = new Service({
      user_id: user.user_id,
      serviceName,
      serviceCategory,
      areas,
      serviceRate: serviceRate / 100, // Store in naira for consistency
      booking: {
        bookingDate,
        bookingTime,
        location,
        paymentStatus: "pending",
        progress: "pending", // Initial status
        payment: {
          authorization_url,
          access_code,
          reference,
          created_at: new Date(),
        },
      },
    });

    await newService.save();
    console.log("✅ Service created successfully:", newService._id);

    return res.status(201).json({
      success: true,
      message: "Service booked successfully",
      data: {
        service_id: newService._id,
        cleaningService: newService,
        payment: {
          authorization_url,
          access_code,
          reference,
        },
      },
    });
  } catch (error) {
    console.error("💥 Create Service Error:", error.message || error);
    next(error);
  }
};

// Verify Payment
const verifyPayment = async (req, res, next) => {
  console.log("🔍 ==> VERIFY PAYMENT ENDPOINT HIT <==");
  console.log("📦 Request Body:", JSON.stringify(req.body, null, 2));

  try {
    const { reference } = req.body;

    // Validate reference
    if (
      !reference ||
      typeof reference !== "string" ||
      reference.trim().length === 0
    ) {
      console.log("❌ Invalid reference:", reference);
      return res.status(400).json({
        success: false,
        message: "Valid transaction reference is required",
        received: req.body,
      });
    }

    console.log("✅ Reference validated:", reference);

    // Check if payment already verified
    const existingVerifiedService = await Service.findOne({
      "booking.payment.reference": reference,
      "booking.paymentStatus": "paid",
    });

    if (existingVerifiedService) {
      console.log("✅ Payment already verified");
      return res.status(200).json({
        success: true,
        message: "Payment already verified",
        data: existingVerifiedService,
        alreadyVerified: true,
      });
    }

    // Verify with Paystack
    console.log("📞 Verifying with Paystack...");
    const paystackResponse = await axios.get(
      `https://api.paystack.co/transaction/verify/${reference}`,
      {
        headers: paystackHeaders,
        timeout: 15000,
      }
    );

    const paymentData = paystackResponse.data.data;
    console.log("💰 Payment status from Paystack:", paymentData.status);

    if (paymentData.status !== "success") {
      console.log("❌ Payment not successful:", paymentData.status);
      return res.status(400).json({
        success: false,
        message: "Payment not successful",
        payment_status: paymentData.status,
        gateway_response: paymentData.gateway_response,
      });
    }

    // Find service
    const service = await Service.findOne({
      "booking.payment.reference": reference,
    });

    if (!service) {
      console.log("❌ Service not found for reference:", reference);
      return res.status(404).json({
        success: false,
        message: "Service not found for this transaction",
        reference: reference,
      });
    }

    console.log("✅ Service found:", service._id);

    // Verify amount (serviceRate is in naira, convert to kobo for comparison)
    const expectedAmount = service.serviceRate * 100;
    const paidAmount = paymentData.amount;

    if (paidAmount !== expectedAmount) {
      console.error("❌ AMOUNT MISMATCH!");
      return res.status(400).json({
        success: false,
        message: "Payment amount does not match service cost",
        expected_amount: expectedAmount / 100,
        paid_amount: paidAmount / 100,
      });
    }

    // Update payment status and progress
    console.log("✏️ Updating payment status...");
    const updateData = {
      "booking.paymentStatus": "paid",
      "booking.progress": "confirmed", // Auto-confirm when paid
      "booking.payment.verified_at": new Date(),
      "booking.payment.paystack_transaction_id": paymentData.id,
      "booking.payment.paid_amount": paidAmount / 100,
      "booking.payment.payment_method": paymentData.channel,
      "booking.payment.gateway_response": paymentData.gateway_response,
      "booking.payment.paid_at": paymentData.paid_at
        ? new Date(paymentData.paid_at)
        : new Date(),
    };

    const updatedService = await Service.findByIdAndUpdate(
      service._id,
      { $set: updateData },
      { new: true }
    );

    console.log("✅ Service updated successfully");
    console.log("💳 New Payment Status:", updatedService.booking.paymentStatus);
    console.log("📊 New Progress Status:", updatedService.booking.progress);

    return res.status(200).json({
      success: true,
      message: "Payment verified successfully",
      data: {
        service_id: updatedService._id,
        payment_status: updatedService.booking.paymentStatus,
        progress_status: updatedService.booking.progress,
        reference: reference,
        verified_at: updatedService.booking.payment.verified_at,
        amount_paid: updatedService.booking.payment.paid_amount,
        payment_method: updatedService.booking.payment.payment_method,
        booking_date: updatedService.booking.bookingDate,
        service_category: updatedService.serviceCategory,
      },
    });
  } catch (error) {
    console.error("💥 Verify Payment Error:", error.message);
    return res.status(500).json({
      success: false,
      message:
        "Payment verification failed. Please try again or contact support.",
      error_id: Date.now(),
    });
  }
};

// Get all User's Services
const getUserServices = asyncHandler(async (req, res, next) => {
  const user_id = req.params.user_id;
  console.log("🔍 Getting services for user:", user_id);

  const userServices = await Service.find({ user_id }).sort({ createdAt: -1 });

  if (userServices.length === 0) {
    return sendResponse(res, 404, false, "No services found for this user", []);
  }

  console.log("✅ Found", userServices.length, "services");
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

// Cancel Service
const cancelService = asyncHandler(async (req, res, next) => {
  const { service_id } = req.params;
  const { cancellationReason } = req.body;

  console.log("🚫 Cancelling service:", service_id);

  const service = await Service.findOne({ service_id });

  if (!service) {
    res.status(404);
    throw new Error("Cleaning service not found");
  }

  // Check if service can be cancelled
  if (!["pending", "confirmed"].includes(service.booking.progress)) {
    res.status(400);
    throw new Error("Cannot cancel service at this stage");
  }

  // Update service status
  service.booking.progress = "cancel";
  service.booking.cancellationReason =
    cancellationReason || "Cancelled by user";
  service.booking.cancelled_at = new Date();
  await service.save();

  console.log("✅ Service cancelled successfully");

  return sendResponse(
    res,
    200,
    true,
    "Cleaning service cancelled successfully",
    service
  );
});

// Update Service Status (for admin/cleaner use)
const updateServiceStatus = asyncHandler(async (req, res, next) => {
  const { service_id } = req.params;
  const { progress, notes } = req.body;

  console.log("🔄 Updating service status:", service_id, "to", progress);

  const service = await Service.findOne({ service_id });

  if (!service) {
    res.status(404);
    throw new Error("Service not found");
  }

  // Validate status transition
  const validStatuses = [
    "pending",
    "confirmed",
    "in-progress",
    "completed",
    "cancel",
  ];
  if (!validStatuses.includes(progress)) {
    res.status(400);
    throw new Error("Invalid status");
  }

  // Update status
  service.booking.progress = progress;
  if (notes) service.booking.notes = notes;

  // Set timestamps based on status
  switch (progress) {
    case "completed":
      service.booking.completed_at = new Date();
      break;
    case "in-progress":
      service.booking.started_at = new Date();
      break;
  }

  await service.save();

  console.log("✅ Service status updated to:", progress);

  return sendResponse(
    res,
    200,
    true,
    `Service status updated to ${progress}`,
    service
  );
});

// Get User's Cancelled Services
const userCancelledServices = asyncHandler(async (req, res, next) => {
  const { user_id } = req.params;

  const cancelledServices = await Service.find({
    user_id,
    "booking.progress": "cancel",
  }).sort({ createdAt: -1 });

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

// Get User's Pending Services
const getUserPendingServices = asyncHandler(async (req, res, next) => {
  const { user_id } = req.params;

  const pendingServices = await Service.find({
    user_id,
    "booking.progress": "pending",
  }).sort({ createdAt: -1 });

  return sendResponse(
    res,
    200,
    true,
    pendingServices.length
      ? "User pending services retrieved successfully"
      : "No pending services found for this user",
    pendingServices
  );
});

// Get User's Confirmed Services
const getUserConfirmedServices = asyncHandler(async (req, res, next) => {
  const { user_id } = req.params;

  const confirmedServices = await Service.find({
    user_id,
    "booking.progress": "confirmed",
  }).sort({ createdAt: -1 });

  return sendResponse(
    res,
    200,
    true,
    confirmedServices.length
      ? "User confirmed services retrieved successfully"
      : "No confirmed services found for this user",
    confirmedServices
  );
});

// Get User's Completed Services
const getUserCompletedServices = asyncHandler(async (req, res, next) => {
  const { user_id } = req.params;

  const completedServices = await Service.find({
    user_id,
    "booking.progress": "completed",
  }).sort({ createdAt: -1 });

  return sendResponse(
    res,
    200,
    true,
    completedServices.length
      ? "User completed services retrieved successfully"
      : "No completed services found for this user",
    completedServices
  );
});

// Get User's Upcoming Services
const getUserUpcomingServices = asyncHandler(async (req, res, next) => {
  const { user_id } = req.params;
  const currentDate = new Date();

  const upcomingServices = await Service.find({
    user_id,
    "booking.bookingDate": { $gte: currentDate },
    "booking.progress": { $in: ["confirmed", "pending"] },
  }).sort({ "booking.bookingDate": 1 });

  return sendResponse(
    res,
    200,
    true,
    upcomingServices.length
      ? "User upcoming services retrieved successfully"
      : "No upcoming services found for this user",
    upcomingServices
  );
});

// Mark Service as Completed
const markTaskCompleted = asyncHandler(async (req, res, next) => {
  const { service_id } = req.params;

  const updatedService = await Service.findOneAndUpdate(
    { service_id },
    {
      "booking.progress": "completed",
      "booking.completed_at": new Date(),
    },
    { new: true }
  );

  if (!updatedService) {
    res.status(404);
    throw new Error("Service not found");
  }

  return sendResponse(
    res,
    200,
    true,
    "Service marked as completed successfully",
    updatedService
  );
});

// Paystack Webhook Handler
const handlePaystackWebhook = async (req, res) => {
  console.log("🎣 ==> PAYSTACK WEBHOOK RECEIVED <==");

  try {
    const signature = req.headers["x-paystack-signature"];
    const payload = JSON.stringify(req.body);

    // Verify webhook signature
    const hash = crypto
      .createHmac("sha512", PAYSTACK_SECRET_KEY)
      .update(payload)
      .digest("hex");

    if (hash !== signature) {
      console.error("❌ Invalid webhook signature");
      return res.status(400).json({ error: "Invalid signature" });
    }

    const event = req.body;
    console.log("📨 Event type:", event.event);

    switch (event.event) {
      case "charge.success":
        await handleSuccessfulPayment(event.data);
        break;
      case "charge.failed":
        await handleFailedPayment(event.data);
        break;
      default:
        console.log(`ℹ️ Unhandled event: ${event.event}`);
    }

    res.status(200).json({ message: "Webhook processed successfully" });
  } catch (error) {
    console.error("💥 Webhook error:", error.message);
    res.status(500).json({ error: "Webhook processing failed" });
  }
};

// Helper: Handle Successful Payment
const handleSuccessfulPayment = async (paymentData) => {
  try {
    const { reference, amount } = paymentData;

    const service = await Service.findOne({
      "booking.payment.reference": reference,
    });

    if (!service) {
      console.log("❌ Service not found for webhook:", reference);
      return;
    }

    // Only update if not already paid
    if (service.booking.paymentStatus !== "paid") {
      service.booking.paymentStatus = "paid";
      service.booking.progress = "confirmed";
      service.booking.payment.webhook_verified_at = new Date();
      service.booking.payment.paid_amount = amount / 100;

      await service.save();
      console.log("✅ Service updated via webhook");
    }
  } catch (error) {
    console.error("💥 Webhook payment processing error:", error);
  }
};

// Helper: Handle Failed Payment
const handleFailedPayment = async (paymentData) => {
  try {
    const { reference, gateway_response } = paymentData;

    const service = await Service.findOne({
      "booking.payment.reference": reference,
    });

    if (service) {
      service.booking.paymentStatus = "failed";
      service.booking.payment.failure_reason = gateway_response;
      service.booking.payment.failed_at = new Date();
      await service.save();

      console.log("✅ Service marked as failed payment");
    }
  } catch (error) {
    console.error("💥 Failed payment processing error:", error);
  }
};

module.exports = {
  createCleaningService,
  verifyPayment,
  getUserServices,
  getSingleService,
  cancelService,
  updateServiceStatus,
  userCancelledServices,
  getUserPendingServices,
  getUserConfirmedServices,
  getUserCompletedServices,
  getUserUpcomingServices,
  markTaskCompleted,
  handlePaystackWebhook,
};
