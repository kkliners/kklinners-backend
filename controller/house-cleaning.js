// controllers/cleaningController.js
const axios = require("axios");
const Service = require("../model/house");
const User = require("../model/user");

class PaymentError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.name = "PaymentError";
    this.statusCode = statusCode;
  }
}

const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY;

// House cleaning categories matching frontend
const CLEANING_CATEGORIES = {
  "Standard Cleaning": {
    description: "Regular maintenance cleaning for ongoing upkeep",
    turnaround: "2-4 hours",
    basePrice: 8000,
    pricePerRoom: 1200,
    icon: "🧹",
  },
  "Deep Cleaning": {
    description: "Thorough, detailed cleaning including hard-to-reach areas",
    turnaround: "4-6 hours",
    basePrice: 15000,
    pricePerRoom: 2000,
    icon: "✨",
  },
  "Move-in Cleaning": {
    description: "Complete cleaning for your new home before moving in",
    turnaround: "5-8 hours",
    basePrice: 20000,
    pricePerRoom: 2500,
    icon: "📦",
  },
  "Move-out Cleaning": {
    description: "Thorough cleaning to get your deposit back",
    turnaround: "5-8 hours",
    basePrice: 22000,
    pricePerRoom: 2800,
    icon: "🏠",
  },
};

// Cleaning packages matching frontend
const CLEANING_PACKAGES = {
  "Basic Package": { multiplier: 0.8 },
  "Standard Package": { multiplier: 1 },
  "Premium Package": { multiplier: 1.4 },
  "Luxury Package": { multiplier: 1.8 },
};

// Home sizes matching frontend
const HOME_SIZES = {
  studio: { multiplier: 0.7 },
  small: { multiplier: 1 },
  medium: { multiplier: 1.5 },
  large: { multiplier: 2.2 },
};

// Frequencies matching frontend
const FREQUENCIES = {
  "one-time": { discount: 0 },
  monthly: { discount: 0.05 },
  "bi-weekly": { discount: 0.1 },
  weekly: { discount: 0.15 },
};

// Validate and calculate price server-side for security
const calculateCleaningPrice = (cleaningData) => {
  const {
    category,
    package: packageName,
    items,
    homeSize,
    frequency,
  } = cleaningData;

  console.log("🧮 Calculating price with data:", {
    category,
    package: packageName,
    items,
    homeSize,
    frequency,
  });

  // Validate category
  const categoryData = CLEANING_CATEGORIES[category];
  if (!categoryData) {
    throw new Error(`Invalid cleaning category: ${category}`);
  }

  // Validate package
  const packageData = CLEANING_PACKAGES[packageName];
  if (!packageData) {
    throw new Error(`Invalid cleaning package: ${packageName}`);
  }

  // Validate home size
  const sizeData = HOME_SIZES[homeSize];
  if (!sizeData) {
    throw new Error(`Invalid home size: ${homeSize}`);
  }

  // Validate frequency
  const frequencyData = FREQUENCIES[frequency];
  if (!frequencyData) {
    throw new Error(`Invalid frequency: ${frequency}`);
  }

  // Calculate total rooms
  const totalItems = Object.values(items).reduce(
    (sum, count) => sum + Number(count),
    0
  );

  if (totalItems === 0) {
    throw new Error("At least one room must be selected");
  }

  // Calculate price using frontend logic
  const baseTotal =
    (categoryData.basePrice + totalItems * categoryData.pricePerRoom) *
    packageData.multiplier *
    sizeData.multiplier;

  const discountedPrice = baseTotal * (1 - frequencyData.discount);
  const finalPrice = Math.round(discountedPrice);

  console.log("💰 Price calculation breakdown:", {
    basePrice: categoryData.basePrice,
    totalItems,
    pricePerRoom: categoryData.pricePerRoom,
    packageMultiplier: packageData.multiplier,
    sizeMultiplier: sizeData.multiplier,
    frequencyDiscount: frequencyData.discount,
    baseTotal,
    discountedPrice,
    finalPrice,
  });

  return {
    finalPrice,
    breakdown: {
      basePrice: categoryData.basePrice,
      roomCount: totalItems,
      pricePerRoom: categoryData.pricePerRoom,
      packageMultiplier: packageData.multiplier,
      sizeMultiplier: sizeData.multiplier,
      frequencyDiscount: frequencyData.discount,
      subtotal: baseTotal,
      discount: baseTotal - discountedPrice,
      total: finalPrice,
    },
  };
};

// Create house cleaning service
const createHouseCleaningService = async (req, res, next) => {
  try {
    console.log("🏠 ===== CREATE HOUSE CLEANING SERVICE =====");
    console.log("📥 Request body:", JSON.stringify(req.body, null, 2));

    const { user_id, cleaningData, bookingDetails, customerInfo } = req.body;

    // Validate required fields
    if (!user_id || !cleaningData || !bookingDetails) {
      console.log("❌ Missing required fields");
      return res.status(400).json({
        success: false,
        message:
          "Missing required fields: user_id, cleaningData, or bookingDetails",
      });
    }

    console.log("object:", cleaningData);

    // Validate cleaning data structure
    const {
      category,
      package: packageName,
      items,
      homeSize,
      frequency,
      estimatedPrice,
      estimatedTime,
      preferredTime,
      specialInstructions,
      turnaround,
    } = cleaningData;

    const { bookingDate, bookingTime, location } = bookingDetails;

    // Validate required cleaning fields
    if (
      !category ||
      !packageName ||
      !items ||
      !homeSize ||
      !frequency ||
      !bookingDate ||
      !bookingTime ||
      !location
    ) {
      return res.status(400).json({
        success: false,
        message: "Missing required cleaning service fields",
        required: [
          "category",
          "package",
          "items",
          "homeSize",
          "frequency",
          "bookingDate",
          "bookingTime",
          "location",
        ],
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

    // Calculate and verify price server-side
    let calculatedPrice;
    try {
      calculatedPrice = calculateCleaningPrice(cleaningData);
    } catch (priceError) {
      console.log("❌ Price calculation error:", priceError.message);
      return res.status(400).json({
        success: false,
        message: "Price calculation failed",
        details: priceError.message,
      });
    }

    // Verify frontend price matches backend calculation (within 1% tolerance)
    const priceDifference = Math.abs(
      calculatedPrice.finalPrice - estimatedPrice
    );
    const tolerance = calculatedPrice.finalPrice * 0.01; // 1% tolerance

    if (priceDifference > tolerance) {
      console.log("❌ Price mismatch detected!");
      console.log("Frontend price:", estimatedPrice);
      console.log("Backend calculated:", calculatedPrice.finalPrice);
      console.log("Difference:", priceDifference);

      return res.status(400).json({
        success: false,
        message: "Price verification failed",
        frontend_price: estimatedPrice,
        calculated_price: calculatedPrice.finalPrice,
        difference: priceDifference,
      });
    }

    const finalServiceRate = calculatedPrice.finalPrice;
    const koboAmount = Math.round(finalServiceRate * 100);

    console.log("💰 ===== FINAL PRICING =====");
    console.log("💰 Service rate (Naira):", finalServiceRate);
    console.log("💰 Paystack amount (kobo):", koboAmount);
    console.log("💰 Price breakdown:", calculatedPrice.breakdown);

    // Check Paystack configuration
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

    // Prepare Paystack payload
    const paystackPayload = {
      email: user.email,
      amount: koboAmount,
      metadata: {
        user_id: user_id,
        service_type: "house_cleaning",
        cleaning_category: category,
        cleaning_package: packageName,
        booking_date: bookingDate,
        room_count: Object.values(items).reduce(
          (sum, count) => sum + Number(count),
          0
        ),
        home_size: homeSize,
        frequency: frequency,
        frontend_price: estimatedPrice,
        calculated_price: finalServiceRate,
      },
    };

    console.log("🚀 Calling Paystack with payload:");
    console.log("📧 Email:", paystackPayload.email);
    console.log("💰 Amount (kobo):", paystackPayload.amount);
    console.log("💰 Amount (Naira equiv):", paystackPayload.amount / 100);

    // Initialize Paystack payment
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

    console.log("✅ Paystack response status:", response.status);
    console.log("✅ Paystack success:", response.data.status);

    if (!response.data.status) {
      throw new Error("Paystack initialization failed");
    }

    const { authorization_url, access_code, reference } = response.data.data;

    console.log("🔗 Payment URL:", authorization_url);
    console.log("📝 Reference:", reference);

    // Save house cleaning service
    const newService = new Service({
      user_id: user.user_id,
      serviceName: "House Cleaning",
      serviceCategory: category,
      serviceType: "house_cleaning",

      // Cleaning-specific data
      cleaningDetails: {
        category: category,
        package: packageName,
        rooms: items,
        homeSize: homeSize,
        frequency: frequency,
        preferredTime: preferredTime,
        specialInstructions: specialInstructions || "",
        estimatedDuration: estimatedTime,
        turnaround: turnaround,
        pricingBreakdown: calculatedPrice.breakdown,
        // ✅ ADD MISSING REQUIRED FIELDS:
        frontendCalculatedPrice: estimatedPrice,
        roomsCount: Object.values(items).reduce(
          (sum, count) => sum + Number(count),
          0
        ),
      },

      // Legacy fields for compatibility
      areas: Object.keys(items).filter((room) => items[room] > 0),
      serviceRate: finalServiceRate,
      roomSizes: items,
      pricingBreakdown: [calculatedPrice.breakdown],
      estimatedDuration: estimatedTime,

      booking: {
        bookingDate,
        bookingTime: bookingTime || preferredTime,
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

      customerInfo: customerInfo || {},
    });

    await newService.save();

    console.log("✅ House cleaning service saved with ID:", newService._id);

    return res.status(201).json({
      success: true,
      message: "House cleaning service booked successfully",
      data: {
        cleaningService: newService,
        payment: {
          authorization_url,
          access_code,
          reference,
          amount_naira: finalServiceRate,
          amount_kobo: koboAmount,
        },
        pricing: calculatedPrice.breakdown,
      },
    });
  } catch (error) {
    console.error("💥 House cleaning service creation error:", error);

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
      message: "House cleaning service creation failed",
      details: error.message,
    });
  }
};

// Get cleaning service categories and pricing
const getCleaningOptions = async (req, res) => {
  try {
    console.log("📋 Getting cleaning options");

    return res.status(200).json({
      success: true,
      data: {
        categories: CLEANING_CATEGORIES,
        packages: Object.keys(CLEANING_PACKAGES).map((key) => ({
          name: key,
          ...CLEANING_PACKAGES[key],
        })),
        homeSizes: Object.keys(HOME_SIZES).map((key) => ({
          id: key,
          ...HOME_SIZES[key],
        })),
        frequencies: Object.keys(FREQUENCIES).map((key) => ({
          id: key,
          ...FREQUENCIES[key],
        })),
      },
    });
  } catch (error) {
    console.error("💥 Error getting cleaning options:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to get cleaning options",
    });
  }
};

// Calculate price endpoint (for frontend validation)
const calculatePrice = async (req, res) => {
  try {
    console.log("🧮 Price calculation request:", req.body);

    const calculatedPrice = calculateCleaningPrice(req.body);

    return res.status(200).json({
      success: true,
      data: calculatedPrice,
    });
  } catch (error) {
    console.error("💥 Price calculation error:", error);
    return res.status(400).json({
      success: false,
      message: "Price calculation failed",
      details: error.message,
    });
  }
};

// Enhanced payment verification for house cleaning
const verifyCleaningPayment = async (req, res, next) => {
  try {
    const { reference } = req.body;

    if (!reference) {
      return res.status(400).json({
        success: false,
        message: "Transaction reference required",
      });
    }

    console.log("🔍 Verifying cleaning service payment:", reference);

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
        message: "Cleaning service not found for this transaction",
      });
    }

    // Verify amounts
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

    // Update to paid status
    const updatedService = await Service.findByIdAndUpdate(
      service._id,
      {
        $set: {
          "booking.paymentStatus": "paid",
          "booking.progress": "confirmed",
          "booking.payment.verified_at": new Date(),
          "booking.payment.paystack_transaction_id": paymentData.id,
          "booking.payment.paid_amount_kobo": paidAmountKobo,
          "booking.payment.paid_amount_naira": paidAmountKobo / 100,
        },
      },
      { new: true }
    );

    console.log("✅ Cleaning service payment verified successfully");

    return res.status(200).json({
      success: true,
      message: "Cleaning service payment verified successfully",
      data: {
        service_id: updatedService._id,
        service_type: "house_cleaning",
        cleaning_category: updatedService.cleaningDetails?.category,
        payment_status: updatedService.booking.paymentStatus,
        booking_status: updatedService.booking.progress,
        amount_paid_naira: paidAmountKobo / 100,
        verified_at: updatedService.booking.payment.verified_at,
        booking_details: {
          date: updatedService.booking.bookingDate,
          time: updatedService.booking.bookingTime,
          location: updatedService.booking.location,
        },
      },
    });
  } catch (error) {
    console.error("💥 Cleaning payment verification error:", error);
    return res.status(500).json({
      success: false,
      message: "Payment verification failed",
    });
  }
};

module.exports = {
  createHouseCleaningService,
  getCleaningOptions,
  calculatePrice,
  verifyCleaningPayment,
  // Keep original functions for backward compatibility
  createCleaningService: createHouseCleaningService,
  verifyPayment: verifyCleaningPayment,
};
