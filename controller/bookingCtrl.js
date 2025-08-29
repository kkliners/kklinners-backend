const User = require("../model/user");
const asyncHandler = require("express-async-handler");

const { Error } = require("mongoose");
// ❌ REMOVED: const calculateServiceRate = require("../utils/calculateRate");
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

// ✅ CLEANED: Use only environment variable for Paystack
const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY;

// ✅ FIXED: Replace the old console.log with detailed debug logs
const createCleaningService = async (req, res, next) => {
  try {
    // ✅ ADD: Detailed debug logging instead of simple "Request Body"
    console.log("🔴 ===== CREATE SERVICE - PURE PASSTHROUGH =====");
    console.log("📥 Request body:", JSON.stringify(req.body, null, 2));

    const {
      user_id,
      serviceName,
      serviceCategory,
      areas,
      bookingDate,
      bookingTime,
      location,
      serviceRate, // ✅ Accept from frontend only
      roomSizes,
      pricingBreakdown,
      estimatedDuration,
    } = req.body;

    // ✅ ADD: Debug the exact serviceRate received
    console.log("💰 Frontend serviceRate:", serviceRate);
    console.log("💰 serviceRate type:", typeof serviceRate);

    // Basic validation
    if (
      !user_id ||
      !serviceName ||
      !serviceCategory ||
      !areas?.length ||
      !bookingDate ||
      !bookingTime ||
      !location ||
      !serviceRate
    ) {
      console.log("❌ Missing required fields");
      return res.status(400).json({
        success: false,
        message: "Missing required fields",
      });
    }

    // Find user
    const user = await User.findOne({ user_id });
    if (!user) {
      console.log("❌ User not found:", user_id);
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    console.log("✅ User found:", user.email);

    // ✅ PURE PASSTHROUGH: Use frontend value exactly as-is
    const finalServiceRate = Number(serviceRate);

    if (isNaN(finalServiceRate) || finalServiceRate <= 0) {
      console.log("❌ Invalid serviceRate from frontend:", serviceRate);
      return res.status(400).json({
        success: false,
        message: "Invalid service rate from frontend",
        received: serviceRate,
      });
    }

    // Convert to kobo for Paystack (this is the ONLY calculation)
    const koboAmount = Math.round(finalServiceRate * 100);

    // ✅ ADD: Show the exact conversion happening
    console.log("💰 ===== FINAL VALUES =====");
    console.log("💰 Frontend rate (Naira):", finalServiceRate);
    console.log("💰 Paystack amount (kobo):", koboAmount);
    console.log("💰 User will see: ₦" + finalServiceRate.toLocaleString());

    // Check Paystack secret key
    if (!PAYSTACK_SECRET_KEY) {
      console.error("❌ PAYSTACK_SECRET_KEY not found in environment");
      return res.status(500).json({
        success: false,
        message: "Payment service configuration error",
      });
    }

    console.log(
      "🔑 Using Paystack key:",
      PAYSTACK_SECRET_KEY.substring(0, 8) + "..."
    );

    // Paystack payload
    const paystackPayload = {
      email: user.email,
      amount: koboAmount, // This is the kobo amount
      metadata: {
        user_id: user_id,
        service_category: serviceCategory,
        booking_date: bookingDate,
        areas_count: areas.length,
        frontend_rate: finalServiceRate, // Store original for debugging
      },
    };

    // ✅ ADD: Show exactly what we're sending to Paystack
    console.log("🚀 Calling Paystack with payload:");
    console.log("📧 Email:", paystackPayload.email);
    console.log("💰 Amount (kobo):", paystackPayload.amount);
    console.log("💰 Amount (Naira equiv):", paystackPayload.amount / 100);

    // Call Paystack API directly
    const response = await axios.post(
      "https://api.paystack.co/transaction/initialize",
      paystackPayload,
      {
        headers: {
          Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
          "Content-Type": "application/json",
        },
      }
    );

    // ✅ ADD: Show Paystack response details
    console.log("✅ Paystack response:");
    console.log("📊 Status:", response.status);
    console.log("✅ Success:", response.data.status);

    if (!response.data.status) {
      throw new Error("Paystack initialization failed");
    }

    const { authorization_url, access_code, reference } = response.data.data;

    console.log("🔗 Payment URL:", authorization_url);
    console.log("📝 Reference:", reference);

    // Save service with frontend data only
    const newService = new Service({
      user_id: user.user_id,
      serviceName,
      serviceCategory,
      areas,
      serviceRate: finalServiceRate, // ✅ Frontend value
      roomSizes: roomSizes || {}, // ✅ Frontend value
      pricingBreakdown: pricingBreakdown || [], // ✅ Frontend value
      estimatedDuration: estimatedDuration, // ✅ Frontend value
      booking: {
        bookingDate,
        bookingTime,
        location,
        paymentStatus: "pending",
        progress: "pending",
        payment: {
          authorization_url,
          access_code,
          reference,
          amount_charged_kobo: koboAmount,
          amount_charged_naira: finalServiceRate,
        },
      },
    });

    await newService.save();

    console.log("✅ Service saved with ID:", newService._id);

    return res.status(201).json({
      success: true,
      message: "Service booked successfully",
      data: {
        cleaningService: newService,
        payment: {
          authorization_url,
          access_code,
          reference,
          amount_naira: finalServiceRate,
          amount_kobo: koboAmount,
        },
      },
    });
  } catch (error) {
    console.error("💥 Service creation error:", error);

    if (error.response?.data) {
      console.error("🔴 Paystack error:", error.response.data);
      return res.status(400).json({
        success: false,
        message: "Payment initialization failed",
        details: error.response.data.message,
      });
    }

    return res.status(500).json({
      success: false,
      message: "Service creation failed",
      details: error.message,
    });
  }
};

// ✅ CLEANED: Payment verification
const verifyPayment = async (req, res, next) => {
  try {
    const { reference } = req.body;

    if (!reference) {
      return res.status(400).json({
        success: false,
        message: "Transaction reference required",
      });
    }

    console.log("🔍 Verifying payment:", reference);

    // Check if already verified
    const existingVerifiedService = await Service.findOne({
      "booking.payment.reference": reference,
      "booking.paymentStatus": "paid",
    });

    if (existingVerifiedService) {
      return res.status(200).json({
        success: true,
        message: "Payment already verified",
        data: existingVerifiedService,
        alreadyVerified: true,
      });
    }

    // Verify with Paystack
    const response = await axios.get(
      `https://api.paystack.co/transaction/verify/${reference}`,
      {
        headers: {
          Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
        },
      }
    );

    const paymentData = response.data.data;

    if (paymentData.status !== "success") {
      return res.status(400).json({
        success: false,
        message: "Payment not successful",
        payment_status: paymentData.status,
      });
    }

    // Find service
    const service = await Service.findOne({
      "booking.payment.reference": reference,
    });

    if (!service) {
      return res.status(404).json({
        success: false,
        message: "Service not found for this transaction",
      });
    }

    // ✅ Verify using stored amounts (no recalculation)
    const expectedAmountKobo = service.booking.payment.amount_charged_kobo;
    const paidAmountKobo = paymentData.amount;

    console.log("💰 Amount verification:");
    console.log("Expected kobo:", expectedAmountKobo);
    console.log("Paid kobo:", paidAmountKobo);

    if (paidAmountKobo !== expectedAmountKobo) {
      console.error("❌ Amount mismatch!");
      return res.status(400).json({
        success: false,
        message: "Payment amount verification failed",
        expected_kobo: expectedAmountKobo,
        paid_kobo: paidAmountKobo,
      });
    }

    // Update to paid
    const updatedService = await Service.findByIdAndUpdate(
      service._id,
      {
        $set: {
          "booking.paymentStatus": "paid",
          "booking.payment.verified_at": new Date(),
          "booking.payment.paystack_transaction_id": paymentData.id,
          "booking.payment.paid_amount_kobo": paidAmountKobo,
          "booking.payment.paid_amount_naira": paidAmountKobo / 100,
        },
      },
      { new: true }
    );

    console.log("✅ Payment verified successfully");

    return res.status(200).json({
      success: true,
      message: "Payment verified successfully",
      data: {
        service_id: updatedService._id,
        payment_status: updatedService.booking.paymentStatus,
        amount_paid_naira: paidAmountKobo / 100,
        verified_at: updatedService.booking.payment.verified_at,
      },
    });
  } catch (error) {
    console.error("💥 Payment verification error:", error);
    return res.status(500).json({
      success: false,
      message: "Payment verification failed",
    });
  }
};

// ❌ REMOVED: All the paystackPayment and initiatePaystackPayment functions
// We're using direct axios calls in createCleaningService instead

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

// Webhook handler for Paystack events
const handlePaystackWebhook = async (req, res) => {
  console.log("🎣 Paystack webhook received");

  try {
    const signature = req.headers["x-paystack-signature"];
    const payload = JSON.stringify(req.body);

    if (!PAYSTACK_SECRET_KEY) {
      console.error("❌ PAYSTACK_SECRET_KEY not found");
      return res.status(500).json({ error: "Server configuration error" });
    }

    const crypto = require("crypto");
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

    res.status(200).json({ message: "Webhook processed" });
  } catch (error) {
    console.error("💥 Webhook error:", error);
    res.status(500).json({ error: "Webhook processing failed" });
  }
};

// Helper functions for webhook
const handleSuccessfulPayment = async (paymentData) => {
  try {
    const { reference } = paymentData;

    const service = await Service.findOne({
      "booking.payment.reference": reference,
    });

    if (service && service.booking.paymentStatus !== "paid") {
      service.booking.paymentStatus = "paid";
      service.booking.payment.webhook_verified_at = new Date();
      await service.save();
      console.log("✅ Service updated via webhook");
    }
  } catch (error) {
    console.error("💥 Webhook success handler error:", error);
  }
};

const handleFailedPayment = async (paymentData) => {
  try {
    const { reference, gateway_response } = paymentData;

    const service = await Service.findOne({
      "booking.payment.reference": reference,
    });

    if (service) {
      service.booking.paymentStatus = "failed";
      service.booking.payment.failure_reason = gateway_response;
      await service.save();
      console.log("✅ Service marked as failed via webhook");
    }
  } catch (error) {
    console.error("💥 Webhook failed handler error:", error);
  }
};

module.exports = {
  createCleaningService,
  getUserServices,
  getSingleService,
  // ❌ REMOVED: paystackPayment,
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
  handlePaystackWebhook,
};
