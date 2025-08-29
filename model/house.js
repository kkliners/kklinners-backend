// models/Service.js
const mongoose = require("mongoose");

const serviceSchema = new mongoose.Schema(
  {
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
      default: "House Cleaning",
    },

    serviceCategory: {
      type: String,
      required: true,
      enum: [
        "Standard Cleaning",
        "Deep Cleaning",
        "Move-in Cleaning",
        "Move-out Cleaning",
      ],
      index: true,
    },
serviceType: {
  type: String,
  required: true,
  default: "house_cleaning",
  // No enum needed
  index: true,
},

    // House cleaning specific details
    cleaningDetails: {
      category: {
        type: String,
        required: true,
        enum: [
          "Standard Cleaning",
          "Deep Cleaning",
          "Move-in Cleaning",
          "Move-out Cleaning",
        ],
      },
      package: {
        type: String,
        required: true,
        enum: [
          "Basic Package",
          "Standard Package",
          "Premium Package",
          "Luxury Package",
        ],
      },
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
        required: true,
        enum: ["studio", "small", "medium", "large"],
      },
      frequency: {
        type: String,
        required: true,
        enum: ["one-time", "monthly", "bi-weekly", "weekly"],
      },
      preferredTime: {
        type: String,
        required: true,
      },
      specialInstructions: {
        type: String,
        default: "",
      },
      estimatedDuration: {
        type: String,
        required: true,
      },
      turnaround: {
        type: String,
        required: true,
      },
      // Frontend pricing info
      frontendCalculatedPrice: {
        type: Number,
        required: true,
      },
      roomsCount: {
        type: Number,
        required: true,
      },
    },

    // Legacy fields for backward compatibility
    areas: [
      {
        type: String,
      },
    ],

    serviceRate: {
      type: Number,
      required: true,
      min: 0,
    },

    roomSizes: {
      type: Map,
      of: Number,
      default: {},
    },

    pricingBreakdown: [
      {
        frontendCalculated: Number,
      },
    ],

    estimatedDuration: {
      type: String,
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
        authorization_url: {
          type: String,
          required: true,
        },
        access_code: {
          type: String,
          required: true,
        },
        reference: {
          type: String,
          required: true,
          unique: true,
          index: true,
        },
        amount_charged_kobo: {
          type: Number,
          required: true,
        },
        amount_charged_naira: {
          type: Number,
          required: true,
        },
        // Fields added after payment verification
        verified_at: Date,
        paystack_transaction_id: String,
        paid_amount_kobo: Number,
        paid_amount_naira: Number,
      },
    },

    // Customer information
    customerInfo: {
      address: String,
      phone: String,
      notes: String,
      specialRequests: [String],
    },
  },
  {
    timestamps: true, // Adds createdAt and updatedAt automatically
  }
);

// Indexes for better query performance
serviceSchema.index({ user_id: 1, createdAt: -1 });
serviceSchema.index({ serviceType: 1, "booking.progress": 1 });
serviceSchema.index({ "booking.bookingDate": 1, "booking.progress": 1 });
serviceSchema.index({ "booking.payment.reference": 1 });

// Virtual for total room count (computed property)
serviceSchema.virtual("totalRooms").get(function () {
  if (this.cleaningDetails && this.cleaningDetails.rooms) {
    return Object.values(this.cleaningDetails.rooms).reduce(
      (sum, count) => sum + count,
      0
    );
  }
  return 0;
});

// Instance methods
serviceSchema.methods.updateProgress = function (status, message, updatedBy) {
  this.booking.progress = status;
  return this.save();
};

serviceSchema.methods.markCompleted = function (completionNotes) {
  this.booking.progress = "completed";
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

module.exports = mongoose.model("Service", serviceSchema);
