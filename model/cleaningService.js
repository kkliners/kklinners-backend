const mongoose = require("mongoose");
const uuid = require("uuid");

const serviceSchema = new mongoose.Schema(
  {
    service_id: {
      type: String,
      default: () => `Service-${uuid.v4()}`,
      unique: true,
    },

    // Common fields for all services
    user_id: {
      type: String,
      ref: "User",
      required: true,
    },

    serviceType: {
      type: String,
      enum: ["cleaning", "gardening", "laundry", "moving"],
      required: true,
    },

    serviceName: {
      type: String,
      required: true,
    },

    serviceCategory: {
      type: String,
      required: true,
    },

    serviceRate: {
      type: Number,
      required: true,
    },

    estimatedDuration: {
      type: String,
    },

    // Service-specific fields using Mixed type for flexibility
    serviceDetails: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },

    booking: {
      bookingDate: {
        type: Date,
        required: true,
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
        enum: ["pending", "paid", "failed"],
        default: "pending",
      },
      progress: {
        type: String,
        enum: ["pending", "in-progress", "completed", "cancelled"],
        default: "pending",
      },
      cancellationReason: {
        type: String,
      },
      specialInstructions: {
        type: String,
      },
    },
  },
  {
    timestamps: true,
    // Add discriminator key for better querying
    discriminatorKey: "serviceType",
  }
);

// Indexes for better performance
serviceSchema.index({ user_id: 1, serviceType: 1 });
serviceSchema.index({ "booking.bookingDate": 1 });
serviceSchema.index({ "booking.progress": 1 });

// Virtual for formatting service details based on type
serviceSchema.virtual("formattedDetails").get(function () {
  return formatServiceDetails(this.serviceType, this.serviceDetails);
});

// Static method to create service with type-specific validation
serviceSchema.statics.createService = function (serviceType, serviceData) {
  const validatedData = validateAndFormatServiceData(serviceType, serviceData);
  return new this(validatedData);
};

// Instance method to update service details
serviceSchema.methods.updateServiceDetails = function (newDetails) {
  const validatedDetails = validateServiceDetails(this.serviceType, newDetails);
  this.serviceDetails = { ...this.serviceDetails, ...validatedDetails };
  return this.save();
};

// Pre-save middleware for validation
serviceSchema.pre("save", function (next) {
  try {
    // Validate service-specific details
    const validation = validateServiceDetails(
      this.serviceType,
      this.serviceDetails
    );
    if (!validation.isValid) {
      throw new Error(validation.errors.join(", "));
    }
    next();
  } catch (error) {
    next(error);
  }
});

// Helper Functions
// ================

/**
 * Validate and format service data based on type
 */
function validateAndFormatServiceData(serviceType, data) {
  const baseData = {
    serviceType,
    user_id: data.user_id,
    serviceName: data.serviceName,
    serviceCategory: data.serviceCategory,
    serviceRate: data.serviceRate,
    estimatedDuration: data.estimatedDuration,
    booking: {
      bookingDate: data.bookingDate,
      bookingTime: data.bookingTime,
      location: data.location,
      specialInstructions: data.specialInstructions,
    },
  };

  // Add service-specific details
  baseData.serviceDetails = formatServiceSpecificData(serviceType, data);

  return baseData;
}

/**
 * Format service-specific data based on type
 */
function formatServiceSpecificData(serviceType, data) {
  switch (serviceType) {
    case "cleaning":
      return {
        areas: data.areas || [],
        roomSizes: data.roomSizes || {},
        pricingBreakdown: data.pricingBreakdown || {},
        cleaningType: data.cleaningType || "standard",
        supplies: data.supplies || "client-provided",
      };

    case "gardening":
      return {
        services: data.services || [],
        gardenSize: data.gardenSize || "medium",
        gardenType: data.gardenType || "residential",
        equipmentProvided: data.equipmentProvided || false,
        seasonalWork: data.seasonalWork || false,
        plantTypes: data.plantTypes || [],
      };

    case "laundry":
      return {
        service: data.service || "wash-fold",
        itemCount: data.itemCount || 0,
        fabricTypes: data.fabricTypes || [],
        turnaround: data.turnaround || "24-48 hours",
        specialCare: data.specialCare || false,
        pickupDelivery: data.pickupDelivery || false,
      };

    case "moving":
      return {
        rooms: data.rooms || {},
        propertySize: data.propertySize || "medium",
        movingDistance: data.movingDistance || "local",
        packingService: data.packingService || false,
        storageNeeded: data.storageNeeded || false,
        heavyItems: data.heavyItems || [],
        floor: data.floor || 1,
      };

    default:
      return {};
  }
}

/**
 * Validate service details based on type
 */
function validateServiceDetails(serviceType, details) {
  const errors = [];

  switch (serviceType) {
    case "cleaning":
      if (
        !details.areas ||
        !Array.isArray(details.areas) ||
        details.areas.length === 0
      ) {
        errors.push("At least one area must be selected for cleaning");
      }

      const validAreas = [
        "Bedroom",
        "Living Room",
        "Kitchen",
        "Bathroom",
        "Terrace",
        "Dining Room",
        "Garage",
      ];
      const invalidAreas = details.areas?.filter(
        (area) => !validAreas.includes(area)
      );
      if (invalidAreas && invalidAreas.length > 0) {
        errors.push(`Invalid areas: ${invalidAreas.join(", ")}`);
      }
      break;

    case "gardening":
      if (
        !details.services ||
        !Array.isArray(details.services) ||
        details.services.length === 0
      ) {
        errors.push("At least one gardening service must be selected");
      }

      const validGardenSizes = ["small", "medium", "large", "extra-large"];
      if (
        details.gardenSize &&
        !validGardenSizes.includes(details.gardenSize)
      ) {
        errors.push("Invalid garden size");
      }
      break;

    case "laundry":
      if (
        details.itemCount &&
        (details.itemCount < 1 || details.itemCount > 100)
      ) {
        errors.push("Item count must be between 1 and 100");
      }
      break;

    case "moving":
      if (!details.rooms || Object.keys(details.rooms).length === 0) {
        errors.push("At least one room must be specified for moving");
      }
      break;
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

/**
 * Format service details for display
 */
function formatServiceDetails(serviceType, details) {
  switch (serviceType) {
    case "cleaning":
      return {
        title: "House Cleaning",
        category: details.cleaningType || "Standard cleaning",
        summary: `${details.areas?.length || 0} areas selected`,
        areas: details.areas || [],
      };

    case "gardening":
      return {
        title: "Gardening Services",
        category: details.gardenType || "Residential",
        summary: `${details.services?.length || 0} services • ${
          details.gardenSize || "Medium"
        } garden`,
        services: details.services || [],
      };

    case "laundry":
      return {
        title: "Laundry Service",
        category: details.service || "Standard Service",
        summary: `${details.itemCount || 0} items • ${
          details.turnaround || "24-48 hours"
        }`,
        service: details.service || "wash-fold",
      };

    case "moving":
      const totalRooms = Object.values(details.rooms || {}).reduce(
        (sum, count) => sum + (Number(count) || 0),
        0
      );
      return {
        title: "Moving Services",
        category: details.movingDistance || "Local Move",
        summary: `${totalRooms} rooms • ${
          details.propertySize || "Medium"
        } property`,
        rooms: details.rooms || {},
      };

    default:
      return {
        title: "Service",
        category: "Unknown",
        summary: "No details available",
      };
  }
}

const Service = mongoose.model("Service", serviceSchema);

module.exports = Service;
