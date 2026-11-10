// controllers/serviceController.js
const axios = require("axios");
const Service = require("../model/house"); // Update to use universal Service model
const User = require("../model/user");
const { calculatePrice, normalizeFrequency } = require("../utils/pricing");
const { isServiceArea, LAUNCH_DISTRICT } = require("../config/marketplace");
const crypto = require("crypto");
const { estimateMinutes, defaultMinutes } = require("../utils/duration");
const { safeReturnOrigin } = require("../utils/returnUrl");
const { PaystackUnavailable, settlePayment } = require("../utils/payments");

const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY;

// Same shape as a fresh booking, for a booking that was already created
const respondWithExisting = (res, s) => {
  const pay = s.booking.payment || {};
  return res.status(200).json({
    success: true,
    existing: true,
    message: "This booking was already created.",
    data: {
      service: s,
      alreadyPaid: s.booking.paymentStatus === "paid",
      payment: {
        authorization_url: pay.authorization_url,
        access_code: pay.access_code,
        reference: pay.reference,
        amount_naira: s.serviceRate,
        amount_kobo: pay.amount_charged_kobo,
      },
    },
  });
};

// Copies of the same booking request that arrive together wait for the first one, instead of each
// starting its own Paystack payment. (The database's unique key is the final guard across servers.)
const inFlight = new Map();

const createService = async (req, res) => {
  let flightId = null;
  let release = () => {};
  try {
    console.log("🚀 ===== CREATE UNIVERSAL SERVICE =====");

    const { serviceType, serviceData, bookingDetails, customerInfo, idempotencyKey } = req.body;

    // Bookings are always made for the logged-in account, never for an id the browser sends
    if (req.body.user_id && req.body.user_id !== req.user.user_id) {
      return res.status(403).json({ success: false, message: "You can only book for your own account." });
    }
    const user_id = req.user.user_id;

    // Validate required fields
    if (!user_id || !serviceType || !serviceData || !bookingDetails) {
      console.log("❌ Missing required fields");
      return res.status(400).json({
        success: false,
        message:
          "Missing required fields: user_id, serviceType, serviceData, or bookingDetails",
      });
    }

    const validServiceTypes = [
      "house_cleaning",
      "laundry",
      "move_out",
      "repairs",
      "gardening",
    ];
    if (!validServiceTypes.includes(serviceType)) {
      return res.status(400).json({
        success: false,
        message: `Invalid service type. Must be one of: ${validServiceTypes.join(
          ", "
        )}`,
      });
    }

    const { bookingDate, bookingTime, location, area } = bookingDetails;
    if (!bookingDate || !bookingTime || !location) {
      return res.status(400).json({
        success: false,
        message:
          "Missing required booking fields: bookingDate, bookingTime, or location",
      });
    }

    // We currently only operate in the launch district
    if (!isServiceArea(area)) {
      return res.status(400).json({
        success: false,
        message: `Kliner is currently only available in ${LAUNCH_DISTRICT}. Please choose a ${LAUNCH_DISTRICT} area.`,
      });
    }

    const user = req.user;

    // Generate unique service_id
    const generateServiceId = () => {
      const timestamp = Date.now().toString();
      const random = Math.random().toString(36).substring(2, 8);
      return `${serviceType.toUpperCase()}-${timestamp}-${random}`;
    };

    const serviceId = generateServiceId();

    // Price is ALWAYS calculated on the server (utils/pricing.js) in naira.
    // The frontend estimate is only kept for reference/debugging.
    if (serviceData.frequency) {
      serviceData.frequency = normalizeFrequency(serviceData.frequency);
    }
    const pricing = calculatePrice(serviceType, serviceData);
    const finalServiceRate = pricing.total;
    const koboAmount = Math.round(finalServiceRate * 100);

    if (finalServiceRate <= 0) {
      return res.status(400).json({
        success: false,
        message:
          "Could not calculate a price for this booking. Please check your selections.",
      });
    }

    if (
      serviceData.estimatedPrice !== undefined &&
      Number(serviceData.estimatedPrice) !== finalServiceRate
    ) {
      console.warn(
        `⚠️ Frontend price ₦${serviceData.estimatedPrice} differs from server price ₦${finalServiceRate}; charging server price`
      );
    }

    console.log("💰 Service rate (₦):", finalServiceRate, "| kobo:", koboAmount);

    // ---- Never create the same booking twice ----
    const key = typeof idempotencyKey === "string" && /^[A-Za-z0-9_-]{8,80}$/.test(idempotencyKey) ? idempotencyKey : null;
    const bookingDay = new Date(bookingDate);
    const sameBooking = (s) =>
      s.serviceType === serviceType &&
      s.serviceRate === finalServiceRate &&
      s.booking.bookingTime === bookingTime &&
      s.booking.area === area &&
      new Date(s.booking.bookingDate).getTime() === bookingDay.getTime();

    if (key) {
      flightId = `${user_id}:${key}`;
      while (inFlight.has(flightId)) await inFlight.get(flightId); // another copy is already being handled
      const gate = new Promise((resolve) => (release = resolve));
      inFlight.set(flightId, gate);
    }

    if (key) {
      const prior = await Service.findOne({ user_id, idempotencyKey: key });
      if (prior) {
        if (!sameBooking(prior)) {
          return res.status(409).json({ success: false, message: "That request was already used for a different booking. Please start the booking again." });
        }
        return respondWithExisting(res, prior);
      }
    }
    // The same unpaid booking sent again within 30 minutes is the same booking: hand back the one that exists
    const recent = await Service.findOne({
      user_id,
      serviceType,
      serviceRate: finalServiceRate,
      "booking.paymentStatus": "pending",
      "booking.bookingTime": bookingTime,
      "booking.area": area,
      "booking.bookingDate": bookingDay,
      createdAt: { $gt: new Date(Date.now() - 30 * 60 * 1000) },
    });
    if (recent) return respondWithExisting(res, recent);

    // Check Paystack configuration
    if (!PAYSTACK_SECRET_KEY) {
      console.error("❌ PAYSTACK_SECRET_KEY not found in environment");
      return res.status(500).json({
        success: false,
        message: "Payment service configuration error",
      });
    }

    const returnBase = safeReturnOrigin(req.body.returnOrigin);

    // Prepare Paystack payload
    const paystackPayload = {
      email: user.email,
      amount: koboAmount,
      currency: "NGN",
      // Back to the app after paying, and back to My Bookings if the customer cancels
      callback_url: `${returnBase}/booking-confirmation`,
      metadata: {
        cancel_action: `${returnBase}/booking/bookings`,
        user_id: user_id,
        service_type: serviceType,
        service_category: serviceData.category || serviceData.repairType,
        booking_date: bookingDate,
        estimated_price: finalServiceRate,
        service_id: serviceId,
      },
    };

    console.log("🚀 Calling Paystack with payload:");
    console.log("📧 Email:", paystackPayload.email);
    console.log("💰 Amount (kobo):", paystackPayload.amount);

    // Initialize Paystack payment
    const response = await axios.post(
      "https://api.paystack.co/transaction/initialize",
      paystackPayload,
      {
        timeout: 15000,
        headers: {
          Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
          "Content-Type": "application/json",
        },
      }
    );

    console.log("✅ Paystack response status:", response.status);

    if (!response.data.status) {
      throw new Error("Paystack initialization failed");
    }

    const { authorization_url, access_code, reference } = response.data.data;

    // Build service details based on service type
    const serviceDetails = buildServiceDetails(serviceType, serviceData);

    // Prepare service document
    const serviceDoc = {
      ...(key ? { idempotencyKey: key } : {}),
      service_id: serviceId,
      user_id: user.user_id,
      serviceName: getServiceName(serviceType),
      serviceCategory: serviceData.category || serviceData.repairType,
      serviceType: serviceType,
      serviceRate: finalServiceRate,
      serviceDetails: serviceDetails,
      booking: {
        bookingDate: new Date(bookingDate),
        bookingTime: bookingTime,
        location,
        area,
        paymentStatus: "pending",
        progress: "pending",
        expectedMinutes: estimateMinutes(serviceType, serviceData),
        payment: {
          authorization_url,
          access_code,
          reference,
          amount_charged_kobo: koboAmount,
          amount_charged_naira: finalServiceRate,
        },
        schedulingDetails: buildSchedulingDetails(serviceType, serviceData),
      },
      customerInfo: {
        name: customerInfo?.name || "",
        email: customerInfo?.email || "",
        phone: customerInfo?.phone || "",
        address: location,
        notes:
          customerInfo?.specialInstructions ||
          serviceData.specialInstructions ||
          "",
      },
      customerSecurity: {
        belongingsAcknowledged: Boolean(req.body.customerSecurity?.belongingsAcknowledged),
        limitedAccessAcknowledged: Boolean(req.body.customerSecurity?.limitedAccessAcknowledged),
        accessNotes: String(req.body.customerSecurity?.accessNotes || "").trim().slice(0, 500),
        visitorCode: "",
        issueReports: [],
      },
      pricingBreakdown: {
        ...pricing,
        frontendCalculated: Number(serviceData.estimatedPrice) || undefined,
      },
      createdAt: new Date(),
    };

    // Legacy compatibility fields for house cleaning
    if (serviceType === "house_cleaning") {
      serviceDoc.areas = Object.keys(serviceData.items || {}).filter(
        (room) => serviceData.items[room] > 0
      );
      serviceDoc.roomSizes = serviceData.items;
      serviceDoc.estimatedDuration = serviceData.estimatedTime;
    }

    console.log(
      "💾 About to save service with service_id:",
      serviceDoc.service_id
    );

    const newService = new Service(serviceDoc);
    await newService.save();

    console.log("✅ Service saved with ID:", newService._id);
    console.log("✅ Service saved with service_id:", newService.service_id);

    return res.status(201).json({
      success: true,
      message: `${getServiceName(serviceType)} booking created successfully`,
      data: {
        service: newService,
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

    // Two copies of the same request arrived at once: the second one gets the first one's booking
    if (error.code === 11000 && error.keyPattern?.idempotencyKey && req.user && req.body?.idempotencyKey) {
      const winner = await Service.findOne({ user_id: req.user.user_id, idempotencyKey: req.body.idempotencyKey });
      if (winner) return respondWithExisting(res, winner);
    }

    // Handle MongoDB duplicate key errors
    if (error.code === 11000) {
      console.error("💥 Duplicate key error:", error.keyPattern);
      return res.status(400).json({
        success: false,
        message: "Duplicate service identifier. Please try again.",
        details: "A service with this identifier already exists",
      });
    }

    // Couldn't reach Paystack at all: nothing was charged, and trying again is safe
    if (axios.isAxiosError(error) && !error.response) {
      return res.status(503).json({
        success: false,
        retryable: true,
        message: "We couldn't reach the payment service. Nothing was charged. Please try again in a moment.",
      });
    }

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
  } finally {
    if (flightId) {
      inFlight.delete(flightId);
      release();
    }
  }
};

// Build service details function - ADD GARDENING CASE



// Universal payment verification
// What the confirmation page shows. It's public, so nothing personal (no address or phone).
const paymentReceipt = (service) => ({
  service: service.serviceCategory || service.serviceName,
  bookingDate: service.booking.bookingDate,
  bookingTime: service.booking.bookingTime,
  amount: service.serviceRate,
  paymentStatus: service.booking.paymentStatus,
  reference: service.booking.payment.reference,
});

// Public on purpose: the customer may come back from Paystack without a session. It only ever
// records a payment that Paystack itself confirms, in full (see utils/payments.js).
const verifyPayment = async (req, res) => {
  try {
    const { reference } = req.body;
    if (typeof reference !== "string" || !reference || reference.length > 100) {
      return res.status(400).json({ success: false, message: "Transaction reference required" });
    }

    const result = await settlePayment(reference);
    switch (result.outcome) {
      case "paid":
        return res.status(200).json({
          success: true,
          message: result.already ? "Payment already verified" : "Payment verified successfully",
          alreadyVerified: !!result.already,
          data: paymentReceipt(result.service),
        });
      case "unknown_reference":
      case "not_found":
        return res.status(404).json({ success: false, message: "Payment not found" });
      case "not_paid":
        return res.status(400).json({ success: false, message: "Payment not completed", payment_status: result.status });
      case "mismatch":
        return res.status(409).json({
          success: false,
          code: "amount_mismatch",
          message: "We received your payment, but the amount doesn't match this booking. Our team will sort it out. You don't need to pay again.",
        });
      default:
        return res.status(500).json({ success: false, message: "Payment verification failed" });
    }
  } catch (error) {
    if (error instanceof PaystackUnavailable) {
      return res.status(503).json({
        success: false,
        retryable: true,
        message: "We couldn't reach the payment service just now. If you've paid, your money is safe. Please check again in a moment.",
      });
    }
    console.error("💥 Service payment verification error:", error);
    return res.status(500).json({ success: false, message: "Payment verification failed" });
  }
};

// Paystack tells us about a payment itself, so it's recorded even if the customer never comes back.
// The signature proves the message really is from Paystack.
const paystackWebhook = async (req, res) => {
  const signature = req.headers["x-paystack-signature"];
  if (!PAYSTACK_SECRET_KEY || !req.rawBody || typeof signature !== "string") return res.sendStatus(401);

  const expected = crypto.createHmac("sha512", PAYSTACK_SECRET_KEY).update(req.rawBody).digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return res.sendStatus(401);

  try {
    const event = req.body;
    if (event?.event === "charge.success" && event.data?.reference) {
      const result = await settlePayment(String(event.data.reference), { tx: event.data });
      console.log(`💳 Webhook ${event.data.reference}: ${result.outcome}`);
    }
    return res.sendStatus(200); // anything else is fine to ignore: acknowledging stops Paystack resending
  } catch (error) {
    console.error("Webhook error:", error);
    return res.sendStatus(500); // Paystack will try again
  }
};

// Helper functions
const getServiceName = (serviceType) => {
  const serviceNames = {
    house_cleaning: "House Cleaning",
    laundry: "Laundry Service",
    move_out: "Moving Service",
    repairs: "Repair Service",
    gardening: "Gardening Service",
  };
  return serviceNames[serviceType] || "Unknown Service";
};

const buildServiceDetails = (serviceType, serviceData) => {
  const serviceDetails = {};

  switch (serviceType) {
    case "house_cleaning":
      serviceDetails.cleaningDetails = {
        category: serviceData.category,
        package: serviceData.package,
        rooms: serviceData.items,
        homeSize: serviceData.homeSize,
        frequency: serviceData.frequency,
        preferredTime: serviceData.preferredTime,
        specialInstructions: serviceData.specialInstructions || "",
        estimatedDuration: serviceData.estimatedTime,
        turnaround: serviceData.turnaround,
        frontendCalculatedPrice: serviceData.estimatedPrice,
        roomsCount: Object.values(serviceData.items || {}).reduce(
          (sum, count) => sum + count,
          0
        ),
      };
      break;

    case "laundry":
      serviceDetails.laundryDetails = {
        category: serviceData.category,
        service: serviceData.service,
        itemCount: Number(serviceData.itemCount) || 0,
        estimatedWeight: Math.max(1, Math.floor((Number(serviceData.itemCount) || 0) / 3)),
        pickupTime: serviceData.pickupTime,
        specialInstructions: serviceData.specialInstructions || "",
        turnaround: serviceData.turnaround,
        frontendCalculatedPrice: serviceData.estimatedPrice,
      };
      break;

    case "move_out":
      serviceDetails.moveOutDetails = {
        category: serviceData.category,
        rooms: serviceData.rooms,
        propertySize: serviceData.propertySize,
        additionalServices: serviceData.additionalServices || [],
        duration: serviceData.duration,
        frontendCalculatedPrice: serviceData.estimatedPrice,
        totalRooms: Object.values(serviceData.rooms || {}).reduce(
          (sum, count) => sum + count,
          0
        ),
      };
      break;

    case "repairs":
      serviceDetails.repairDetails = {
        repairType: serviceData.repairType,
        urgency: serviceData.urgency,
        description: serviceData.description || "",
        photosCount: serviceData.photosCount || 0,
        photoUrls: serviceData.photoUrls || [],
        estimatedCost: serviceData.estimatedPrice || 0,
        warrantyPeriod: "90 days",
      };
      break;

    case "gardening": {
      // Model stores services as { "Lawn Mowing": 1, ... }
      const serviceNames = {
        "lawn-mowing": "Lawn Mowing",
        "hedge-trimming": "Hedge Trimming",
        weeding: "Weeding",
        planting: "Planting",
        pruning: "Pruning",
        "leaf-removal": "Leaf Removal",
      };
      const services = {};
      (serviceData.services || []).forEach((id) => {
        if (serviceNames[id]) services[serviceNames[id]] = 1;
      });
      serviceDetails.gardeningDetails = {
        category: serviceData.category,
        services,
        gardenSize: serviceData.gardenSize,
        frequency: serviceData.frequency,
        specialInstructions: serviceData.specialInstructions || "",
      };
      break;
    }
  }

  return serviceDetails;
};

const buildSchedulingDetails = (serviceType, serviceData) => {
  const details = {};

  switch (serviceType) {
    case "house_cleaning":
      details.recurringSchedule = serviceData.frequency;
      break;
    case "laundry":
      details.pickupTime = serviceData.pickupTime;
      break;
    case "move_out":
      details.appointmentWindow = serviceData.duration;
      break;
    case "repairs":
      details.appointmentWindow = serviceData.urgency;
      break;
    case "gardening":
      details.recurringSchedule = serviceData.frequency;
      break;
  }

  return details;
};

// Legacy compatibility functions
const createHouseCleaningService = async (req, res) => {
  const transformedBody = {
    user_id: req.body.user_id,
    serviceType: "house_cleaning",
    serviceData: req.body.cleaningData,
    bookingDetails: req.body.bookingDetails,
    customerInfo: req.body.customerInfo,
    idempotencyKey: req.body.idempotencyKey,
    returnOrigin: req.body.returnOrigin,
  };
  req.body = transformedBody;
  return createService(req, res);
};


/////////////////////////////////
// GET /api/v1/services/my-services - Get user's services
const getUserServices = async (req, res) => {
  try {
    console.log("🔍 ===== GET USER SERVICES =====");
    
    // Get user_id from token or params
    let user_id = req.user?.user_id || req.user?.id;
    
    if (!user_id) {
      return res.status(401).json({
        success: false,
        message: "User authentication required",
      });
    }

    console.log("👤 Fetching services for user:", user_id);

    // Parse query parameters for filtering
    const {
      status,
      serviceType,
      limit = 20,
      page = 1,
      sortBy = 'createdAt',
      sortOrder = 'desc',
      dateFrom,
      dateTo,
    } = req.query;

    // Build filter object
    const filter = { user_id };

    // Add status filter
    if (status) {
      const validStatuses = ['pending', 'confirmed', 'in_progress', 'completed', 'cancelled'];
      if (validStatuses.includes(status)) {
        filter['booking.progress'] = status;
      }
    }

    // Add service type filter
    if (serviceType) {
      const validTypes = ['house_cleaning', 'laundry', 'move_out', 'repairs', 'gardening'];
      if (validTypes.includes(serviceType)) {
        filter.serviceType = serviceType;
      }
    }

    // Add date range filter
    if (dateFrom || dateTo) {
      filter['booking.bookingDate'] = {};
      if (dateFrom) {
        filter['booking.bookingDate'].$gte = new Date(dateFrom);
      }
      if (dateTo) {
        filter['booking.bookingDate'].$lte = new Date(dateTo);
      }
    }

    console.log("🔍 Filter:", filter);

    // Calculate pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    // Build sort object
    const sort = {};
    sort[sortBy] = sortOrder === 'desc' ? -1 : 1;

    // Execute query with pagination
    const [services, totalCount] = await Promise.all([
      Service.find(filter)
        .sort(sort)
        .limit(parseInt(limit))
        .skip(skip)
        .lean(),
      Service.countDocuments(filter)
    ]);

    // Calculate pagination info
    const totalPages = Math.ceil(totalCount / parseInt(limit));
    const hasNextPage = parseInt(page) < totalPages;
    const hasPrevPage = parseInt(page) > 1;

    console.log(`✅ Found ${services.length} services (${totalCount} total)`);

    const { formatCustomerService } = require("../utils/customerJobSecurity");
    const formattedServices = services.map((service) => formatCustomerService(service));

    return res.status(200).json({
      success: true,
      message: "Services retrieved successfully",
      data: {
        serverTime: new Date().toISOString(),
        services: formattedServices,
        pagination: {
          currentPage: parseInt(page),
          totalPages,
          totalCount,
          hasNextPage,
          hasPrevPage,
          limit: parseInt(limit),
        },
        filters: {
          status,
          serviceType,
          dateFrom,
          dateTo,
        },
      },
    });

  } catch (error) {
    console.error("💥 Error fetching user services:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to retrieve services",
      details: error.message,
    });
  }
};

// GET /api/v1/services/all - Get all services (Admin only)
const getAllServices = async (req, res) => {
  try {
    console.log("🔍 ===== GET ALL SERVICES (ADMIN) =====");
    
    // Check if user is admin
    const user = await User.findOne({ user_id: req.user?.user_id || req.user?.id });
    
    if (!user || user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: "Admin access required",
      });
    }

    console.log("👑 Admin access granted for:", user.email);

    // Parse query parameters
    const {
      status,
      serviceType,
      paymentStatus,
      user_id,
      limit = 50,
      page = 1,
      sortBy = 'createdAt',
      sortOrder = 'desc',
      dateFrom,
      dateTo,
      search,
    } = req.query;

    // Build filter object
    const filter = {};

    // Add status filter
    if (status) {
      const validStatuses = ['pending', 'confirmed', 'in_progress', 'completed', 'cancelled'];
      if (validStatuses.includes(status)) {
        filter['booking.progress'] = status;
      }
    }

    // Add payment status filter
    if (paymentStatus) {
      const validPaymentStatuses = ['pending', 'paid', 'failed', 'refunded'];
      if (validPaymentStatuses.includes(paymentStatus)) {
        filter['booking.paymentStatus'] = paymentStatus;
      }
    }

    // Add service type filter
    if (serviceType) {
      const validTypes = ['house_cleaning', 'laundry', 'move_out', 'repairs', 'gardening'];
      if (validTypes.includes(serviceType)) {
        filter.serviceType = serviceType;
      }
    }

    // Add user filter
    if (user_id) {
      filter.user_id = user_id;
    }

    // Add date range filter
    if (dateFrom || dateTo) {
      filter['booking.bookingDate'] = {};
      if (dateFrom) {
        filter['booking.bookingDate'].$gte = new Date(dateFrom);
      }
      if (dateTo) {
        filter['booking.bookingDate'].$lte = new Date(dateTo);
      }
    }

    // Add search filter
    if (search) {
      filter.$or = [
        { serviceName: { $regex: search, $options: 'i' } },
        { serviceCategory: { $regex: search, $options: 'i' } },
        { 'customerInfo.name': { $regex: search, $options: 'i' } },
        { 'customerInfo.email': { $regex: search, $options: 'i' } },
        { 'booking.location': { $regex: search, $options: 'i' } },
      ];
    }

    console.log("🔍 Admin filter:", filter);

    // Calculate pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    // Build sort object
    const sort = {};
    sort[sortBy] = sortOrder === 'desc' ? -1 : 1;

    // Execute query with pagination
    const [services, totalCount] = await Promise.all([
      Service.find(filter)
        .sort(sort)
        .limit(parseInt(limit))
        .skip(skip)
        .lean(),
      Service.countDocuments(filter)
    ]);

    // Get service statistics
    const stats = await Service.aggregate([
      { $match: dateFrom || dateTo ? {
        'booking.bookingDate': {
          ...(dateFrom && { $gte: new Date(dateFrom) }),
          ...(dateTo && { $lte: new Date(dateTo) })
        }
      } : {} },
      {
        $group: {
          _id: null,
          totalServices: { $sum: 1 },
          totalRevenue: { $sum: '$serviceRate' },
          pendingServices: {
            $sum: { $cond: [{ $eq: ['$booking.progress', 'pending'] }, 1, 0] }
          },
          completedServices: {
            $sum: { $cond: [{ $eq: ['$booking.progress', 'completed'] }, 1, 0] }
          },
          paidServices: {
            $sum: { $cond: [{ $eq: ['$booking.paymentStatus', 'paid'] }, 1, 0] }
          },
        }
      }
    ]);

    // Service type breakdown
    const serviceTypeBreakdown = await Service.aggregate([
      { $match: filter },
      {
        $group: {
          _id: '$serviceType',
          count: { $sum: 1 },
          revenue: { $sum: '$serviceRate' },
        }
      }
    ]);

    // Calculate pagination info
    const totalPages = Math.ceil(totalCount / parseInt(limit));
    const hasNextPage = parseInt(page) < totalPages;
    const hasPrevPage = parseInt(page) > 1;

    console.log(`✅ Found ${services.length} services (${totalCount} total)`);

    // Format services for admin response (more detailed)
    const formattedServices = services.map(service => ({
      id: service._id,
      service_id: service.service_id,
      user_id: service.user_id,
      serviceName: service.serviceName,
      serviceType: service.serviceType,
      serviceCategory: service.serviceCategory,
      serviceRate: service.serviceRate,
      status: service.booking.progress,
      paymentStatus: service.booking.paymentStatus,
      bookingDate: service.booking.bookingDate,
      bookingTime: service.booking.bookingTime,
      location: service.booking.location,
      area: service.booking.area,
      partnerName: service.serviceProvider?.providerName || null,
      partnerPhone: ["accepted", "in_progress", "completion_requested"].includes(service.booking.progress)
        ? service.serviceProvider?.providerPhone
        : null,
      createdAt: service.createdAt,
      updatedAt: service.updatedAt,
      customerInfo: {
        name: service.customerInfo?.name,
        email: service.customerInfo?.email,
        phone: service.customerInfo?.phone,
      },
      payment: {
        reference: service.booking?.payment?.reference,
        amount_naira: service.booking?.payment?.amount_charged_naira,
      },
      serviceProvider: service.serviceProvider,
      // Include service-specific details
      serviceDetails: service.serviceDetails,
    }));

    return res.status(200).json({
      success: true,
      message: "All services retrieved successfully",
      data: {
        services: formattedServices,
        pagination: {
          currentPage: parseInt(page),
          totalPages,
          totalCount,
          hasNextPage,
          hasPrevPage,
          limit: parseInt(limit),
        },
        statistics: stats[0] || {
          totalServices: 0,
          totalRevenue: 0,
          pendingServices: 0,
          completedServices: 0,
          paidServices: 0,
        },
        serviceTypeBreakdown,
        filters: {
          status,
          serviceType,
          paymentStatus,
          user_id,
          dateFrom,
          dateTo,
          search,
        },
      },
    });

  } catch (error) {
    console.error("💥 Error fetching all services:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to retrieve services",
      details: error.message,
    });
  }
};

// GET /api/v1/services/:id - Get single service details
const getServiceById = async (req, res) => {
  try {
    console.log("🔍 ===== GET SERVICE BY ID =====");
    
    const { id } = req.params;
    const user_id = req.user?.user_id || req.user?.id;

    if (!user_id) {
      return res.status(401).json({
        success: false,
        message: "User authentication required",
      });
    }

    // Find service
    const service = await Service.findById(id).lean();

    if (!service) {
      return res.status(404).json({
        success: false,
        message: "Service not found",
      });
    }

    // Check if user owns the service or is admin
    const user = await User.findOne({ user_id });
    const isOwner = service.user_id === user_id;
    const isAdmin = user?.role === 'admin';

    if (!isOwner && !isAdmin) {
      return res.status(403).json({
        success: false,
        message: "Access denied. You can only view your own services.",
      });
    }

    console.log("✅ Service found:", service.serviceName);

    const { formatCustomerService } = require("../utils/customerJobSecurity");
    const payload = isAdmin ? service : formatCustomerService(service);

    return res.status(200).json({
      success: true,
      message: "Service retrieved successfully",
      data: {
        service: payload,
        isOwner,
        isAdmin,
      },
    });

  } catch (error) {
    console.error("💥 Error fetching service:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to retrieve service",
      details: error.message,
    });
  }
};

// GET /api/v1/services/stats - Get service statistics (Admin only)
const getServiceStats = async (req, res) => {
  try {
    console.log("📊 ===== GET SERVICE STATISTICS =====");
    
    // Check if user is admin
    const user = await User.findOne({ user_id: req.user?.user_id || req.user?.id });
    
    if (!user || user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: "Admin access required",
      });
    }

    const { timeRange = '30d' } = req.query;

    // Calculate date range
    const now = new Date();
    let startDate;
    
    switch (timeRange) {
      case '7d':
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case '30d':
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      case '90d':
        startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
        break;
      case '1y':
        startDate = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
        break;
      default:
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    }

    // Aggregate statistics
    const stats = await Service.aggregate([
      {
        $facet: {
          overall: [
            {
              $group: {
                _id: null,
                totalServices: { $sum: 1 },
                totalRevenue: { $sum: '$serviceRate' },
                averageServiceValue: { $avg: '$serviceRate' },
                completedServices: {
                  $sum: { $cond: [{ $eq: ['$booking.progress', 'completed'] }, 1, 0] }
                },
                pendingPayments: {
                  $sum: { $cond: [{ $eq: ['$booking.paymentStatus', 'pending'] }, 1, 0] }
                },
              }
            }
          ],
          byServiceType: [
            {
              $group: {
                _id: '$serviceType',
                count: { $sum: 1 },
                revenue: { $sum: '$serviceRate' },
                averageValue: { $avg: '$serviceRate' },
              }
            }
          ],
          byStatus: [
            {
              $group: {
                _id: '$booking.progress',
                count: { $sum: 1 },
                revenue: { $sum: '$serviceRate' },
              }
            }
          ],
          recentTrend: [
            {
              $match: {
                createdAt: { $gte: startDate }
              }
            },
            {
              $group: {
                _id: {
                  $dateToString: {
                    format: '%Y-%m-%d',
                    date: '$createdAt'
                  }
                },
                count: { $sum: 1 },
                revenue: { $sum: '$serviceRate' },
              }
            },
            { $sort: { '_id': 1 } }
          ]
        }
      }
    ]);

    console.log("✅ Statistics generated successfully");

    return res.status(200).json({
      success: true,
      message: "Service statistics retrieved successfully",
      data: {
        timeRange,
        overall: stats[0].overall[0] || {},
        byServiceType: stats[0].byServiceType,
        byStatus: stats[0].byStatus,
        recentTrend: stats[0].recentTrend,
        generatedAt: new Date(),
      },
    });

  } catch (error) {
    console.error("💥 Error generating statistics:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to generate statistics",
      details: error.message,
    });
  }
};

// POST /api/v1/services/:id/owner-issue — property owner reports a problem on a paid job
const reportOwnerIssue = async (req, res) => {
  try {
    const user_id = req.user?.user_id || req.user?.id;
    const message = String(req.body?.message || "").trim();
    if (message.length < 10) {
      return res.status(400).json({ success: false, message: "Describe what happened (at least 10 characters)." });
    }

    const service = await Service.findById(req.params.id);
    if (!service) return res.status(404).json({ success: false, message: "Booking not found." });
    if (service.user_id !== user_id) {
      return res.status(403).json({ success: false, message: "You can only report issues on your own bookings." });
    }
    if (service.booking.paymentStatus !== "paid") {
      return res.status(400).json({ success: false, message: "This booking is not paid yet." });
    }

    let photos = [];
    if (req.files?.length) {
      const { uploadBuffers } = require("../utils/uploadFieldImages");
      photos = await uploadBuffers(req.files, "ownerIssues");
    }

    const updated = await Service.findByIdAndUpdate(
      service._id,
      {
        $push: {
          "customerSecurity.issueReports": { message, photos, createdAt: new Date() },
        },
      },
      { new: true }
    );

    return res.json({
      success: true,
      message: "We've received your report. Our team will review arrival logs and field updates.",
      data: { issueCount: (updated.customerSecurity?.issueReports || []).length },
    });
  } catch (error) {
    console.error("Owner issue report error:", error);
    return res.status(500).json({ success: false, message: "Could not send your report." });
  }
};

module.exports = {
  createService,
  verifyPayment,
  getUserServices,
  getAllServices,
  getServiceById,
  getServiceStats,
  reportOwnerIssue,
  // Legacy compatibility
  createHouseCleaningService,
  createCleaningService: createHouseCleaningService,
  verifyCleaningPayment: verifyPayment,
  paystackWebhook,
};
