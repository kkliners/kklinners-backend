// models/Service.js - Updated with gardening support
const mongoose = require("mongoose");

const serviceSchema = new mongoose.Schema(
  {
    // ADD UNIQUE SERVICE_ID FIELD
    service_id: {
      type: String,
      unique: true,
      sparse: true, // Allows multiple null values but enforces uniqueness when present
      index: true,
    },

    // User identification
    user_id: {
      type: String,
      required: true,
      index: true,
    },

    // Basic service info
    serviceName: {
      type: String,
      required: true,
    },

    serviceType: {
      type: String,
      required: true,
      enum: ["house_cleaning", "laundry", "move_out", "repairs", "gardening"], // ADDED GARDENING
      index: true,
    },

    serviceCategory: {
      type: String,
      required: true,
      index: true,
    },

    // Service rate (calculated by backend)
    serviceRate: {
      type: Number,
      required: true,
      min: 0,
    },

    // Service-specific details (flexible structure)
    serviceDetails: {
      // House Cleaning Details
      cleaningDetails: {
        category: String,
        package: String,
        rooms: {
          "Living Room": { type: Number, default: 0 },
          Bedrooms: { type: Number, default: 0 },
          Bathrooms: { type: Number, default: 0 },
          Kitchen: { type: Number, default: 0 },
          "Dining Room": { type: Number, default: 0 },
          "Terrace/Balcony": { type: Number, default: 0 },
          Garage: { type: Number, default: 0 },
          "Study/Office": { type: Number, default: 0 },
        },
        homeSize: {
          type: String,
          enum: ["studio", "small", "medium", "large"],
        },
        frequency: {
          type: String,
          enum: ["one-time", "monthly", "bi-weekly", "weekly"],
        },
        preferredTime: String,
        specialInstructions: String,
        estimatedDuration: String,
        turnaround: String,
        frontendCalculatedPrice: Number,
        roomsCount: Number,
      },

      // Laundry Details
      laundryDetails: {
        category: String,
        service: String,
        itemCount: Number,
        estimatedWeight: Number,
        pickupTime: String,
        specialInstructions: String,
        turnaround: String,
        frontendCalculatedPrice: Number,
      },

      // Move-out/Moving Details
      moveOutDetails: {
        category: String,
        rooms: {
          "Living Room": { type: Number, default: 0 },
          Terrace: { type: Number, default: 0 },
          Bedroom: { type: Number, default: 0 },
          Bathroom: { type: Number, default: 0 },
          Kitchen: { type: Number, default: 0 },
          "Dining Room": { type: Number, default: 0 },
          Garage: { type: Number, default: 0 },
          "Storage/Utility": { type: Number, default: 0 },
        },
        propertySize: {
          type: String,
          enum: ["studio", "small", "medium", "large"],
        },
        additionalServices: [String],
        duration: String,
        frontendCalculatedPrice: Number,
        totalRooms: Number,
      },

      // Repair Details
      repairDetails: {
        repairType: {
          type: String,
          enum: [
            "plumbing",
            "electrical",
            "appliance",
            "carpentry",
            "painting",
            "general",
          ],
        },
        urgency: {
          type: String,
          enum: ["standard", "priority", "emergency"],
        },
        description: String,
        photosCount: { type: Number, default: 0 },
        photoUrls: [String],
        estimatedCost: Number,
        warrantyPeriod: { type: String, default: "90 days" },
      },

      // GARDENING DETAILS - NEW SECTION
      gardeningDetails: {
        category: String, // Basic Maintenance, Landscape Care, Seasonal Service, Premium Garden Care
        package: String, // Basic, Standard, Premium, Luxury Package
        services: {
          "Lawn Mowing": { type: Number, default: 0 },
          "Hedge Trimming": { type: Number, default: 0 },
          Weeding: { type: Number, default: 0 },
          Planting: { type: Number, default: 0 },
          Pruning: { type: Number, default: 0 },
          "Leaf Removal": { type: Number, default: 0 },
        },
        gardenSize: {
          type: String,
          enum: ["small", "medium", "large", "xlarge"],
        },
        frequency: {
          type: String,
          enum: ["one-time", "monthly", "bi-weekly", "weekly"],
        },
        preferredTime: String,
        specialInstructions: String,
        estimatedDuration: String,
        turnaround: String,
        frontendCalculatedPrice: Number,
        servicesCount: Number, // Total number of selected services
      },

      // Common fields
      estimatedDuration: String,
      specialRequests: [String],
    },

    // Legacy fields for backward compatibility
    areas: [String],
    roomSizes: {
      type: Map,
      of: Number,
      default: {},
    },

    // Pricing information
    pricingBreakdown: {
      basePrice: Number,
      additionalCharges: [
        {
          description: String,
          amount: Number,
        },
      ],
      discounts: [
        {
          description: String,
          amount: Number,
        },
      ],
      subtotal: Number,
      taxes: Number,
      total: Number,
      frontendCalculated: Number,
    },

    // Booking details
    booking: {
      bookingDate: {
        type: Date,
        required: true,
        index: true,
      },
      bookingTime: {
        type: String,
        required: true,
      },
      location: {
        type: String,
        required: true,
      },
      paymentStatus: {
        type: String,
        enum: ["pending", "paid", "failed", "refunded"],
        default: "pending",
        index: true,
      },
      progress: {
        type: String,
        enum: ["pending", "confirmed", "in_progress", "completed", "cancelled"],
        default: "pending",
        index: true,
      },
      payment: {
        authorization_url: String,
        access_code: String,
        reference: {
          type: String,
          required: true,
          unique: true,
          index: true,
        },
        amount_charged_kobo: Number,
        amount_charged_naira: Number,
        verified_at: Date,
        paystack_transaction_id: String,
        paid_amount_kobo: Number,
        paid_amount_naira: Number,
      },
      schedulingDetails: {
        pickupTime: String, // For laundry
        deliveryTime: String, // For laundry
        appointmentWindow: String, // For repairs and gardening
        recurringSchedule: String, // For cleaning and gardening frequency
      },
    },

    // Customer information
    customerInfo: {
      name: String,
      email: String,
      phone: String,
      address: String,
      notes: String,
      specialRequests: [String],
    },

    // Service provider assignment
    serviceProvider: {
      providerId: String,
      providerName: String,
      assignedAt: Date,
      providerNotes: String,
    },

    // Service completion details
    completion: {
      completedAt: Date,
      completionNotes: String,
      customerRating: {
        type: Number,
        min: 1,
        max: 5,
      },
      customerReview: String,
      beforePhotos: [String],
      afterPhotos: [String],
    },
  },
  {
    timestamps: true,
  }
);

// Indexes for better query performance
serviceSchema.index({ user_id: 1, createdAt: -1 });
serviceSchema.index({ serviceType: 1, "booking.progress": 1 });
serviceSchema.index({ "booking.bookingDate": 1, "booking.progress": 1 });
serviceSchema.index({ "booking.payment.reference": 1 });
serviceSchema.index({ serviceType: 1, serviceCategory: 1 });
serviceSchema.index({ service_id: 1 }, { sparse: true }); // ADD SERVICE_ID INDEX

// Virtual properties
serviceSchema.virtual("totalRooms").get(function () {
  if (
    this.serviceType === "house_cleaning" &&
    this.serviceDetails.cleaningDetails?.rooms
  ) {
    return Object.values(this.serviceDetails.cleaningDetails.rooms).reduce(
      (sum, count) => sum + count,
      0
    );
  }
  if (
    this.serviceType === "move_out" &&
    this.serviceDetails.moveOutDetails?.rooms
  ) {
    return Object.values(this.serviceDetails.moveOutDetails.rooms).reduce(
      (sum, count) => sum + count,
      0
    );
  }
  return 0;
});

// ADD GARDENING VIRTUAL PROPERTY
serviceSchema.virtual("totalGardenServices").get(function () {
  if (
    this.serviceType === "gardening" &&
    this.serviceDetails.gardeningDetails?.services
  ) {
    return Object.values(this.serviceDetails.gardeningDetails.services).reduce(
      (sum, count) => sum + count,
      0
    );
  }
  return 0;
});

serviceSchema.virtual("serviceTypeDisplay").get(function () {
  const typeMap = {
    house_cleaning: "House Cleaning",
    laundry: "Laundry Service",
    move_out: "Moving Service",
    repairs: "Repair Service",
    gardening: "Gardening Service", // ADD GARDENING
  };
  return typeMap[this.serviceType] || this.serviceType;
});

// Instance methods
serviceSchema.methods.updateProgress = function (status, message, updatedBy) {
  this.booking.progress = status;
  if (message) {
    this.customerInfo.notes =
      (this.customerInfo.notes || "") +
      `\n${new Date().toISOString()}: ${message}`;
  }
  return this.save();
};

serviceSchema.methods.markCompleted = function (
  completionNotes,
  rating = null
) {
  this.booking.progress = "completed";
  this.completion.completedAt = new Date();
  if (completionNotes) {
    this.completion.completionNotes = completionNotes;
  }
  if (rating) {
    this.completion.customerRating = rating;
  }
  return this.save();
};

serviceSchema.methods.assignProvider = function (providerId, providerName) {
  this.serviceProvider.providerId = providerId;
  this.serviceProvider.providerName = providerName;
  this.serviceProvider.assignedAt = new Date();
  this.booking.progress = "confirmed";
  return this.save();
};

// Static methods
serviceSchema.statics.findUpcomingByUser = function (user_id) {
  return this.find({
    user_id,
    "booking.bookingDate": { $gte: new Date() },
    "booking.progress": { $in: ["pending", "confirmed"] },
  }).sort({ "booking.bookingDate": 1 });
};

serviceSchema.statics.findByPaymentReference = function (reference) {
  return this.findOne({ "booking.payment.reference": reference });
};

serviceSchema.statics.findPendingByUser = function (user_id) {
  return this.find({
    user_id,
    "booking.progress": "pending",
  })
    .sort({ createdAt: -1 })
    .limit(3);
};

serviceSchema.statics.findByServiceType = function (serviceType, filters = {}) {
  return this.find({ serviceType, ...filters }).sort({ createdAt: -1 });
};

serviceSchema.statics.getServiceStats = function (
  serviceType,
  dateRange = null
) {
  const matchStage = { serviceType };
  if (dateRange) {
    matchStage.createdAt = dateRange;
  }

  return this.aggregate([
    { $match: matchStage },
    {
      $group: {
        _id: "$booking.progress",
        count: { $sum: 1 },
        totalRevenue: { $sum: "$serviceRate" },
      },
    },
  ]);
};

// Pre-save middleware to set service name based on type
serviceSchema.pre("save", function (next) {
  if (!this.serviceName) {
    const serviceNames = {
      house_cleaning: "House Cleaning",
      laundry: "Laundry Service",
      move_out: "Moving Service",
      repairs: "Repair Service",
      gardening: "Gardening Service", // ADD GARDENING
    };
    this.serviceName = serviceNames[this.serviceType] || "Unknown Service";
  }
  next();
});

module.exports = mongoose.model("Service", serviceSchema);
