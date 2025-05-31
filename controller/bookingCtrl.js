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
  console.log("🔍 ==> VERIFY PAYMENT ENDPOINT HIT <==");
  console.log("📦 Request Body:", JSON.stringify(req.body, null, 2));
  console.log(
    "🔑 Auth Header:",
    req.headers.authorization ? "Present" : "Missing"
  );
  console.log("🌐 Request IP:", req.ip || req.connection.remoteAddress);
  console.log("⏰ Timestamp:", new Date().toISOString());

  try {
    const { reference } = req.body;

    // Validate reference
    if (!reference) {
      console.log("❌ No reference provided in request body");
      return res.status(400).json({
        success: false,
        message: "Transaction reference is required",
        received: req.body,
      });
    }

    if (typeof reference !== "string" || reference.trim().length === 0) {
      console.log("❌ Invalid reference format:", reference);
      return res.status(400).json({
        success: false,
        message: "Invalid transaction reference format",
        received: reference,
      });
    }

    console.log("✅ Reference validated:", reference);

    // Check environment variables
    const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY;
    if (!PAYSTACK_SECRET_KEY) {
      console.log("❌ PAYSTACK_SECRET_KEY environment variable missing");
      return res.status(500).json({
        success: false,
        message: "Payment service configuration error",
      });
    }
    console.log("✅ Paystack secret key found");

    // Check if payment already verified (prevent duplicate processing)
    console.log("🔍 Checking if payment already verified...");
    const existingVerifiedService = await Service.findOne({
      "booking.payment.reference": reference,
      "booking.paymentStatus": "paid",
    });

    if (existingVerifiedService) {
      console.log(
        "✅ Payment already verified for service:",
        existingVerifiedService._id
      );
      return res.status(200).json({
        success: true,
        message: "Payment already verified",
        data: existingVerifiedService,
        alreadyVerified: true,
      });
    }

    // Verify payment with Paystack
    console.log("📞 Calling Paystack verification API...");
    console.log(
      "🔗 URL:",
      `https://api.paystack.co/transaction/verify/${reference}`
    );

    let response;
    try {
      response = await axios.get(
        `https://api.paystack.co/transaction/verify/${reference}`,
        {
          headers: {
            Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
            "Content-Type": "application/json",
          },
          timeout: 15000, // 15 seconds timeout
        }
      );
      console.log("✅ Paystack API call successful");
      console.log("📊 Response Status:", response.status);
      console.log("📄 Response Data:", JSON.stringify(response.data, null, 2));
    } catch (paystackError) {
      console.error("❌ Paystack API Error:");
      console.error("Error Type:", paystackError.constructor.name);
      console.error("Error Message:", paystackError.message);

      if (paystackError.response) {
        console.error("Response Status:", paystackError.response.status);
        console.error("Response Data:", paystackError.response.data);

        if (paystackError.response.status === 404) {
          return res.status(404).json({
            success: false,
            message:
              "Transaction not found on Paystack. Please contact support.",
            reference: reference,
          });
        } else if (paystackError.response.status === 401) {
          return res.status(500).json({
            success: false,
            message: "Payment service authentication failed",
          });
        }
      } else if (paystackError.code === "ECONNABORTED") {
        return res.status(408).json({
          success: false,
          message: "Payment verification timeout. Please try again.",
        });
      }

      throw paystackError;
    }

    const paymentData = response.data.data;
    console.log("💰 Payment Status from Paystack:", paymentData.status);
    console.log("💵 Payment Amount:", paymentData.amount);
    console.log("📧 Customer Email:", paymentData.customer?.email);

    if (paymentData.status !== "success") {
      console.log("❌ Payment not successful:", paymentData.status);
      return res.status(400).json({
        success: false,
        message: "Payment not successful",
        payment_status: paymentData.status,
        gateway_response: paymentData.gateway_response,
      });
    }

    // Find the service linked to this payment reference
    console.log("🔍 Looking for service with reference:", reference);
    const service = await Service.findOne({
      "booking.payment.reference": reference,
    });

    if (!service) {
      console.log("❌ Service not found for reference:", reference);

      // Debug: Check what services exist with payment references
      const servicesWithPayments = await Service.find(
        { "booking.payment.reference": { $exists: true } },
        { "booking.payment.reference": 1, _id: 1, user_id: 1 }
      ).limit(5);

      console.log(
        "🔍 Available services with payment references:",
        servicesWithPayments.map((s) => ({
          id: s._id,
          reference: s.booking?.payment?.reference,
          user_id: s.user_id,
        }))
      );

      return res.status(404).json({
        success: false,
        message: "Service not found for this transaction",
        reference: reference,
        debug: {
          availableReferences: servicesWithPayments
            .map((s) => s.booking?.payment?.reference)
            .filter(Boolean),
        },
      });
    }

    console.log("✅ Service found:");
    console.log("🆔 Service ID:", service._id);
    console.log("👤 User ID:", service.user_id);
    console.log("💰 Service Rate:", service.serviceRate);
    console.log("📅 Booking Date:", service.booking.bookingDate);
    console.log("💳 Current Payment Status:", service.booking.paymentStatus);

    // Security check: Verify amount matches
    const expectedAmount = service.serviceRate * 100; // Convert to kobo
    const paidAmount = paymentData.amount;

    console.log("💰 Amount Verification:");
    console.log("Expected (kobo):", expectedAmount);
    console.log("Paid (kobo):", paidAmount);

    if (paidAmount !== expectedAmount) {
      console.error("❌ AMOUNT MISMATCH DETECTED!");
      console.error("Expected:", expectedAmount, "Paid:", paidAmount);

      return res.status(400).json({
        success: false,
        message: "Payment amount does not match service cost",
        expected_amount: expectedAmount / 100,
        paid_amount: paidAmount / 100,
        reference: reference,
      });
    }

    console.log("✅ Amount verification passed");

    // Update payment status
    console.log("✏️ Updating payment status to 'paid'...");
    const updateData = {
      "booking.paymentStatus": "paid",
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

    if (!updatedService) {
      console.error("❌ Failed to update service");
      return res.status(500).json({
        success: false,
        message: "Failed to update service record",
      });
    }

    console.log("✅ Service updated successfully");
    console.log("💳 New Payment Status:", updatedService.booking.paymentStatus);

    // Success response
    const successResponse = {
      success: true,
      message: "Payment verified successfully",
      data: {
        service_id: updatedService._id,
        payment_status: updatedService.booking.paymentStatus,
        reference: reference,
        verified_at: updatedService.booking.payment.verified_at,
        amount_paid: updatedService.booking.payment.paid_amount,
        payment_method: updatedService.booking.payment.payment_method,
        booking_date: updatedService.booking.bookingDate,
        service_category: updatedService.serviceCategory,
      },
    };

    console.log("🎉 Sending success response");
    console.log("📤 Response:", JSON.stringify(successResponse, null, 2));

    return res.status(200).json(successResponse);
  } catch (error) {
    console.error("💥 ==> VERIFY PAYMENT ERROR <==");
    console.error("Error Type:", error.constructor.name);
    console.error("Error Message:", error.message);
    console.error("Error Stack:", error.stack);

    if (error.response) {
      console.error("API Error Response:", error.response.data);
      console.error("API Error Status:", error.response.status);
      console.error("API Error Headers:", error.response.headers);
    }

    // Don't expose internal errors to client
    return res.status(500).json({
      success: false,
      message:
        "Payment verification failed. Please try again or contact support.",
      error_id: Date.now(), // For tracking in logs
    });
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
