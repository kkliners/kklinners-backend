const mongoose = require("mongoose");
const uuid = require("uuid");

const cleaningServiceSchema = new mongoose.Schema(
  {
    service_id: {
      type: String,
      default: () => `Service-${uuid.v4()}`,
      unique: true,
    },
    user_id: {
      type: String,
      ref: "User",
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
    },
    areas: {
      type: [String],
      enum: [
        "Bedroom",
        "Living Room",
        "Kitchen",
        "Bathroom",
        "Terrace",
        "Dining Room",
        "Garage",
      ],
      required: true,
    },
    // Direct fields (not nested in booking object)
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
      enum: ["pending", "paid", "failed", "refunded"],
      default: "pending",
    },
    paymentReference: {
      type: String, // Paystack reference like "ir4o9sot2k"
    },
    confirmed: {
      type: Boolean,
      default: false, // This is the boolean field you're seeing
    },
    // Optional: Keep the nested booking structure for compatibility
    booking: {
      bookingDate: {
        type: Date,
      },
      bookingTime: {
        type: String,
      },
      location: {
        type: String,
      },
      paymentStatus: {
        type: String,
        enum: ["pending", "paid", "failed", "refunded"],
        default: "pending",
      },
      progress: {
        type: String,
        enum: ["pending", "confirmed", "in-progress", "completed", "cancel"],
        default: "pending",
      },
      cancellationReason: {
        type: String,
      },
    },
    completedAt: {
      type: Date,
    },
    cancelledAt: {
      type: Date,
    },
    assignedCleaner: {
      type: String,
    },
    notes: {
      type: String,
    },
  },
  {
    timestamps: true,
  }
);

// Method to confirm booking and update payment
cleaningServiceSchema.methods.confirmBooking = function (paymentReference) {
  this.confirmed = true;
  this.paymentStatus = "paid";
  this.paymentReference = paymentReference;

  // Also update nested booking object if it exists
  if (this.booking) {
    this.booking.paymentStatus = "paid";
    this.booking.progress = "confirmed";
  }

  return this.save();
};

// Method to cancel booking
cleaningServiceSchema.methods.cancelBooking = function (reason = "") {
  this.confirmed = false;
  this.cancelledAt = new Date();

  if (this.booking) {
    this.booking.progress = "cancel";
    this.booking.cancellationReason = reason;
  }

  return this.save();
};

// Virtual to get current status
cleaningServiceSchema.virtual("currentStatus").get(function () {
  if (this.cancelledAt) return "cancel";
  if (this.completedAt) return "completed";
  if (this.confirmed && this.paymentStatus === "paid") return "confirmed";
  return "pending";
});

const Service = mongoose.model("Service", cleaningServiceSchema);

module.exports = Service;
