const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const uuid = require("uuid");
const crypto = require("crypto");

// Declare the Schema of the Mongo model
const Schema = mongoose.Schema;

const userSchema = new Schema(
  {
    user_id: {
      type: String,
      default: () => `Klinner-${uuid.v4()}`, // Using a function to concatenate prefix and UUID
      unique: true,
      index: true, // Add index for faster queries
    },
    username: {
      type: String,
      unique: true,
      trim: true,
      minlength: 3,
      maxlength: 30,
      sparse: true, // Allow null/undefined values while maintaining uniqueness
    },
    email: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
      match: /^\S+@\S+\.\S+$/,
      index: true, // Add index for faster queries
    },
    lastName: {
      type: String,
      trim: true,
      maxlength: 100,
      default: "", // Set default empty string
    },
    firstName: {
      type: String,
      trim: true,
      maxlength: 100,
      default: "", // Set default empty string
    },
    phone: {
      type: String,
      trim: true,
      default: "", // Set default empty string
    },
    password: {
      type: String,
      required: true,
      minlength: 6,
    },
    address: {
      type: String,
      trim: true,
      default: "", // Set default empty string
    },
    city: {
      type: String,
      trim: true,
      maxlength: 100,
      default: "", // Set default empty string
    },
    state: {
      type: String,
      trim: true,
      maxlength: 100,
      default: "", // Set default empty string
    },
    profileImage: {
      url: {
        type: String,
        default: "", // Set default empty string
      },
      public_id: {
        type: String,
        default: "", // For Cloudinary public_id if you're using it
      },
    },
    refreshToken: {
      type: String, // Store the refresh token in the database
      default: "",
    },
    token: {
      type: String,
      default: "",
    },
    otp: {
      type: String,
      default: "",
    },
    expiresAt: {
      type: Date,
    },
    role: {
      type: String,
      enum: ["user", "admin", "provider"], // Define allowed roles
      default: "user",
    },
    isBlocked: {
      type: Boolean,
      default: false,
    },
    isEmailVerified: {
      type: Boolean,
      default: false, // Track email verification status
    },
    passwordChangeAt: {
      type: Date,
    },
    verificationTokenExpires: {
      type: Number,
    },
    passwordResetExpires: {
      type: Date,
    },
    // Add metadata fields
    lastLogin: {
      type: Date,
    },
    profileCompletionStatus: {
      type: Number,
      default: 0,
      min: 0,
      max: 100, // Percentage of profile completion
    },
  },
  {
    timestamps: true, // Automatically add createdAt and updatedAt fields
    toJSON: {
      transform: function (doc, ret) {
        // Remove sensitive fields when converting to JSON
        delete ret.password;
        delete ret.refreshToken;
        delete ret.token;
        delete ret.otp;
        return ret;
      },
    },
  }
);

// Indexes for better performance
userSchema.index({ email: 1 });
userSchema.index({ user_id: 1 });
userSchema.index({ username: 1 });
userSchema.index({ role: 1 });
userSchema.index({ isBlocked: 1 });

// Encrypt incoming registered password
userSchema.pre("save", async function (next) {
  if (!this.isModified("password")) {
    return next();
  }
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

// Decrypt Database password for incoming password from registered User
userSchema.methods.isPasswordMatched = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

userSchema.methods.createVerificationToken = async function () {
  // Generate a random 4-digit token
  const verificationToken = Math.floor(1000 + Math.random() * 9000).toString();

  // Set the verification token and expiration time in the user document
  this.verificationTokenExpires = verificationToken;
  this.passwordResetExpires = Date.now() + 10 * 60 * 1000; // Expires in 10 minutes
  // Return the generated verification token
  return verificationToken;
};

// Method to calculate profile completion percentage
userSchema.methods.calculateProfileCompletion = function () {
  const requiredFields = [
    "firstName",
    "lastName",
    "email",
    "phone",
    "username",
    "address",
    "city",
    "state",
  ];

  let completedFields = 0;
  requiredFields.forEach((field) => {
    if (this[field] && this[field].trim() !== "") {
      completedFields++;
    }
  });

  // Add profile image to completion calculation
  if (
    this.profileImage &&
    this.profileImage.url &&
    this.profileImage.url.trim() !== ""
  ) {
    completedFields++;
  }

  const totalFields = requiredFields.length + 1; // +1 for profile image
  this.profileCompletionStatus = Math.round(
    (completedFields / totalFields) * 100
  );

  return this.profileCompletionStatus;
};

// Method to update last login
userSchema.methods.updateLastLogin = function () {
  this.lastLogin = new Date();
  return this.save();
};

const User = mongoose.model("User", userSchema);

module.exports = User;
