// A verified service company (e.g. a cleaning company) that fulfils bookings.
const mongoose = require("mongoose");
const { SERVICE_AREAS } = require("../config/marketplace");

const SERVICE_TYPES = ["house_cleaning", "laundry", "move_out", "repairs", "gardening"];

const partnerSchema = new mongoose.Schema(
  {
    // Kliner account that manages this company (logs in like any user)
    user_id: { type: String, required: true, unique: true, index: true },

    companyName: { type: String, required: true, trim: true },
    contactName: { type: String, required: true, trim: true },
    phone: { type: String, required: true, trim: true },
    email: { type: String, required: true, trim: true, lowercase: true },
    officeAddress: { type: String, required: true, trim: true },
    // CAC is optional — most small cleaning businesses aren't registered.
    isRegisteredBusiness: { type: Boolean, default: false },
    cacNumber: { type: String, trim: true }, // RC/BN number, if registered

    // Owner identity. We store only the ID TYPE; the admin sees the actual
    // ID in person during the office visit (avoids storing ID numbers).
    owner: {
      fullName: { type: String, trim: true },
      idType: {
        type: String,
        enum: ["nin", "voters_card", "drivers_licence", "intl_passport"],
      },
    },

    guarantor: {
      fullName: { type: String, trim: true },
      phone: { type: String, trim: true },
      relationship: { type: String, trim: true },
      address: { type: String, trim: true },
    },

    // Past clients we can call
    references: [
      {
        name: { type: String, trim: true },
        phone: { type: String, trim: true },
        _id: false,
      },
    ],

    // Checks the Kliner team completes before verifying
    verificationChecks: {
      idSeen: { type: Boolean, default: false }, // owner's ID seen in person and matches
      bankNameMatches: { type: Boolean, default: false }, // payout account is in owner's or business's name
      guarantorCalled: { type: Boolean, default: false },
      referencesCalled: { type: Boolean, default: false },
      officeVisited: { type: Boolean, default: false },
      cacChecked: { type: Boolean, default: false }, // only if registered
      notes: { type: String, trim: true },
    },
    teamSize: { type: Number, min: 1, default: 1 },
    yearsInBusiness: { type: Number, min: 0, default: 0 },
    about: { type: String, trim: true, maxlength: 1000 },

    services: {
      type: [{ type: String, enum: SERVICE_TYPES }],
      validate: (v) => v.length > 0,
    },
    areas: {
      type: [{ type: String, enum: SERVICE_AREAS }],
      validate: (v) => v.length > 0,
    },

    bank: {
      bankName: { type: String, trim: true },
      accountNumber: { type: String, trim: true },
      accountName: { type: String, trim: true },
    },

    status: {
      type: String,
      enum: ["pending", "verified", "rejected", "suspended"],
      default: "pending",
      index: true,
    },
    statusNote: String, // reason shown to the partner
    verifiedAt: Date,
    verifiedBy: String, // admin user_id

    // Override the platform commission for this partner (optional)
    commissionRate: { type: Number, min: 0, max: 1 },

    stats: {
      jobsCompleted: { type: Number, default: 0 },
      ratingTotal: { type: Number, default: 0 },
      ratingCount: { type: Number, default: 0 },
    },
  },
  { timestamps: true }
);

partnerSchema.virtual("rating").get(function () {
  return this.stats.ratingCount
    ? Math.round((this.stats.ratingTotal / this.stats.ratingCount) * 10) / 10
    : null;
});
partnerSchema.set("toJSON", { virtuals: true });

module.exports = mongoose.model("Partner", partnerSchema);
module.exports.SERVICE_TYPES = SERVICE_TYPES;
