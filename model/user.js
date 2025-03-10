const mongoose = require('mongoose'); // Erase if already required
const bcrypt = require('bcryptjs');
const uuid = require('uuid');
const crypto = require('crypto');


// Declare the Schema of the Mongo model

const Schema = mongoose.Schema;

const userSchema = new Schema({
  user_id: {
    type: String,
    default: () => `Klinner-${uuid.v4()}`, // Using a function to concatenate prefix and UUID
    unique: true,
  },
  username: {
    type: String,
    unique: true,
    trim: true,
    minlength: 3,
    maxlength: 30,
  },
  email: {
    type: String,

    unique: true,
    trim: true,
    lowercase: true,
    match: /^\S+@\S+\.\S+$/,
  },

  lastName: {
    type: String,
    trim: true,

    maxlength: 100,
  },
  firstName: {
    type: String,
    trim: true,

    maxlength: 100,
  },

  phone: {
    type: String,
  },
  password: {
    type: String,
    minlength: 6,
  },
  address: {
    type: String,
  },
  profileImage: {
    url: {
      type: String,
    },
  },
  refreshToken: {
    type: String, // Store the refresh token in the database
  },
  token: {
    type: String,
  },
  otp: {
    type: String,
  },
  expiresAt: {
    type: Date,
  },
  role: {
    type: String,
    default: "user",
  },
  isBlocked: {
    type: Boolean,
    default: false,
  },
  passwordChangeAt: Date,
  verificationTokenExpires: Number,
  passwordResetExpires: Date,
});

//Encrypt incoming registered password
userSchema.pre("save", async function(next){
  if (!this.isModified('password')) {
    next()
  }
  const salt =await bcrypt.genSaltSync(10);
  this.password = await bcrypt.hash(this.password, salt);
})

//Decrypt Database paswword for incoming password from registered User
userSchema.methods.isPasswordMatched = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
  
}


userSchema.methods.createVerificationToken = async function () {
  // Generate a random 4-digit token
  const verificationToken = Math.floor(1000 + Math.random() * 9000).toString();

  // Set the verification token and expiration time in the user document
  this.verificationTokenExpires = verificationToken;
  this.passwordResetExpires = Date.now() + 10 * 60 * 1000; // Expires in 10 minutes
  // Return the generated verification token
  return verificationToken;
};
const User = mongoose.model('User', userSchema);

module.exports = User;
