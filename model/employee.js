const mongoose = require("mongoose");
const { v4: uuidv4 } = require("uuid");

const documentSchema = new mongoose.Schema(
  {
    docType: {
      type: String,
      enum: ["nin", "voters_card", "drivers_licence", "passport", "contract", "other"],
      default: "other",
    },
    label: { type: String, default: "" },
    url: { type: String, required: true },
    mimeType: { type: String, default: "image/jpeg" },
    publicId: { type: String, default: "" },
    uploadedAt: { type: Date, default: Date.now },
  },
  { _id: true }
);

const employeeSchema = new mongoose.Schema(
  {
    employee_id: {
      type: String,
      default: () => `KLN-EMP-${uuidv4().slice(0, 8)}`,
      unique: true,
      index: true,
    },
    firstName: { type: String, required: true, trim: true, maxlength: 80 },
    lastName: { type: String, required: true, trim: true, maxlength: 80 },
    phone: { type: String, trim: true, default: "" },
    bvn: {
      type: String,
      required: true,
      trim: true,
      validate: {
        validator: (v) => /^\d{11}$/.test(String(v || "")),
        message: "BVN must be 11 digits.",
      },
    },
    profilePhoto: {
      url: { type: String, default: "" },
      publicId: { type: String, default: "" },
    },
    documents: [documentSchema],
    status: {
      type: String,
      enum: ["active", "inactive"],
      default: "active",
      index: true,
    },
    notes: { type: String, default: "", maxlength: 2000 },
  },
  { timestamps: true }
);

employeeSchema.virtual("fullName").get(function fullName() {
  return `${this.firstName} ${this.lastName}`.trim();
});

module.exports = mongoose.model("Employee", employeeSchema);
