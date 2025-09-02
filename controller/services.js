// controllers/serviceController.js
const axios = require("axios");
const Service = require("../model/house"); // Update to use universal Service model
const User = require("../model/user");

const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY;

const createService = async (req, res) => {
  try {
    console.log("🚀 ===== CREATE UNIVERSAL SERVICE =====");
    console.log("📥 Request body:", JSON.stringify(req.body, null, 2));

    const { user_id, serviceType, serviceData, bookingDetails, customerInfo } =
      req.body;

    // Validate required fields
    if (!user_id || !serviceType || !serviceData || !bookingDetails) {
      console.log("❌ Missing required fields");
      return res.status(400).json({
        success: false,
        message:
          "Missing required fields: user_id, serviceType, serviceData, or bookingDetails",
      });
    }

    // Validate service type - ADDED GARDENING
    const validServiceTypes = [
      "house_cleaning",
      "laundry",
      "move_out",
      "repairs",
      "gardening", // ADDED THIS
    ];
    if (!validServiceTypes.includes(serviceType)) {
      return res.status(400).json({
        success: false,
        message: `Invalid service type. Must be one of: ${validServiceTypes.join(
          ", "
        )}`,
      });
    }

    const { bookingDate, bookingTime, location } = bookingDetails;
    if (!bookingDate || !bookingTime || !location) {
      return res.status(400).json({
        success: false,
        message:
          "Missing required booking fields: bookingDate, bookingTime, or location",
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

    // Generate unique service_id
    const generateServiceId = () => {
      const timestamp = Date.now().toString();
      const random = Math.random().toString(36).substring(2, 8);
      return `${serviceType.toUpperCase()}-${timestamp}-${random}`;
    };

    // Use the estimated price from frontend (no server-side calculation)
    const finalServiceRate = serviceData.estimatedPrice || 0;
    const koboAmount = Math.round(finalServiceRate * 100);

    console.log("💰 ===== PRICING FROM FRONTEND =====");
    console.log("💰 Service rate (Naira):", finalServiceRate);
    console.log("💰 Paystack amount (kobo):", koboAmount);

    // Check Paystack configuration
    if (!PAYSTACK_SECRET_KEY) {
      console.error("❌ PAYSTACK_SECRET_KEY not found in environment");
      return res.status(500).json({
        success: false,
        message: "Payment service configuration error",
      });
    }

    // Prepare Paystack payload
    const paystackPayload = {
      email: user.email,
      amount: koboAmount,
      metadata: {
        user_id: user_id,
        service_type: serviceType,
        service_category: serviceData.category || serviceData.repairType,
        booking_date: bookingDate,
        estimated_price: finalServiceRate,
        service_id: generateServiceId(), // Include service_id in metadata
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
      service_id: generateServiceId(), // ADD UNIQUE SERVICE_ID
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
        paymentStatus: "pending",
        progress: "pending",
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
      pricingBreakdown: {
        total: finalServiceRate,
        frontendCalculated: finalServiceRate,
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

    // Handle MongoDB duplicate key errors
    if (error.code === 11000) {
      console.error("💥 Duplicate key error:", error.keyPattern);
      return res.status(400).json({
        success: false,
        message: "Duplicate service identifier. Please try again.",
        details: "A service with this identifier already exists",
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
  }
};

// Build service details function - ADD GARDENING CASE



// Universal payment verification
const verifyPayment = async (req, res) => {
  try {
    const { reference } = req.body;

    if (!reference) {
      return res.status(400).json({
        success: false,
        message: "Transaction reference required",
      });
    }

    console.log("🔍 Verifying service payment:", reference);

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

    // Verify amounts
    const expectedAmountKobo = service.booking.payment.amount_charged_kobo;
    const paidAmountKobo = paymentData.amount;

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

    console.log("✅ Service payment verified successfully");

    return res.status(200).json({
      success: true,
      message: `${getServiceName(
        service.serviceType
      )} payment verified successfully`,
      data: {
        service_id: updatedService._id,
        service_type: updatedService.serviceType,
        service_category: updatedService.serviceCategory,
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
    console.error("💥 Service payment verification error:", error);
    return res.status(500).json({
      success: false,
      message: "Payment verification failed",
    });
  }
};

// Helper functions
const getServiceName = (serviceType) => {
  const serviceNames = {
    house_cleaning: "House Cleaning",
    laundry: "Laundry Service",
    move_out: "Moving Service",
    repairs: "Repair Service",
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
        itemCount: serviceData.itemCount,
        estimatedWeight: Math.max(1, Math.floor(serviceData.itemCount / 3)),
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

    // Format services for response
    const formattedServices = services.map(service => ({
      id: service._id,
      service_id: service.service_id,
      serviceName: service.serviceName,
      serviceType: service.serviceType,
      serviceCategory: service.serviceCategory,
      serviceRate: service.serviceRate,
      status: service.booking.progress,
      paymentStatus: service.booking.paymentStatus,
      bookingDate: service.booking.bookingDate,
      bookingTime: service.booking.bookingTime,
      location: service.booking.location,
      createdAt: service.createdAt,
      updatedAt: service.updatedAt,
      // Include service-specific details based on type
      ...(service.serviceType === 'house_cleaning' && {
        roomsCount: service.serviceDetails?.cleaningDetails?.roomsCount || 0,
        package: service.serviceDetails?.cleaningDetails?.package,
        frequency: service.serviceDetails?.cleaningDetails?.frequency,
      }),
      ...(service.serviceType === 'gardening' && {
        servicesCount: service.serviceDetails?.gardeningDetails?.servicesCount || 0,
        package: service.serviceDetails?.gardeningDetails?.package,
        gardenSize: service.serviceDetails?.gardeningDetails?.gardenSize,
        frequency: service.serviceDetails?.gardeningDetails?.frequency,
      }),
      ...(service.serviceType === 'laundry' && {
        itemCount: service.serviceDetails?.laundryDetails?.itemCount || 0,
        service: service.serviceDetails?.laundryDetails?.service,
      }),
      ...(service.serviceType === 'repairs' && {
        repairType: service.serviceDetails?.repairDetails?.repairType,
        urgency: service.serviceDetails?.repairDetails?.urgency,
      }),
    }));

    return res.status(200).json({
      success: true,
      message: "Services retrieved successfully",
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

    return res.status(200).json({
      success: true,
      message: "Service retrieved successfully",
      data: {
        service,
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

module.exports = {
  createService,
  verifyPayment,
  getUserServices,
  getAllServices,
  getServiceById,
  getServiceStats,
  // Legacy compatibility
  createHouseCleaningService,
  createCleaningService: createHouseCleaningService,
  verifyCleaningPayment: verifyPayment,
};
