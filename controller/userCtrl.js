const User = require('../model/user');
const Pin = require('../model/Pin');
const asyncHandler = require('express-async-handler');
const {token }= require('../config/jwt')
const sendEmail = require('../utils/email')
const cloudinary = require('../utils/cloudinary');
const upload = require('../utils/multerUpload')
function generateOTP() {
  // Generate a 4-digit random OTP
  const otp = Math.floor(1000 + Math.random() * 9000).toString();

  return otp;
}
class CustomError extends Error {
  constructor(message, statusCode = 500) {
    super(message);
    this.name = "CustomError";
    this.statusCode = statusCode;
  }
}


const userImageUpdate = (req, res, next) => {
  upload.single('image')(req, res, async (multerErr) => {
    if (multerErr) {
      // Handle multer upload error
      return next(multerErr);
    }

    try {
      // Generate a unique identifier (demo: timestamp + random number)
      const uniqueIdentifier = `${Date.now()}_${Math.floor(Math.random() * 1000)}`;

      // Create a promise for Cloudinary upload
      const cloudinaryUpload = () =>
        new Promise((resolve, reject) => {
          const uploadStream = cloudinary.uploader.upload_stream(
            { public_id: uniqueIdentifier, folder: 'profileImage' },
            (err, result) => {
              if (err) {
                reject(err);
              } else {
                resolve(result);
              }
            }
          );

          // Pipe the buffer to the Cloudinary upload stream
          uploadStream.end(req.file.buffer);
        });

      // Upload to Cloudinary using the promise
      const cloudinaryResult = await cloudinaryUpload();

      // Extract the HTTP URL (url) property
      const httpUrl = cloudinaryResult.url;

      // Respond with the extracted HTTP URL
      res.status(201).json({
        success: true,
        message: 'User image uploaded successfully.',
        data: { url: httpUrl },
      });
    } catch (cloudinaryErr) {
      // Handle Cloudinary upload error
      console.error('Cloudinary upload error:', cloudinaryErr);
      return res.status(400).json({
        success: false,
        error: 'Image upload fails',
        details: null,
      });
    }
  });
};

//Middleware that get called in signup for userImageUpdate
const uploadProfileImage = (req, res, next) => {
  upload.single('image')(req, res, async (multerErr) => {
    if (multerErr) {
      // Handle multer upload error
      return next(multerErr);
    }
  
    try {
      // Generate a unique identifier (demo: timestamp + random number)
      const uniqueIdentifier = `${Date.now()}_${Math.floor(Math.random() * 1000)}`;
  
      // Create a promise for Cloudinary upload
      const cloudinaryUpload = () =>
        new Promise((resolve, reject) => {
          const uploadStream = cloudinary.uploader.upload_stream(
            { public_id: uniqueIdentifier, folder: 'profileImage' },
            (err, result) => {
              if (err) {
                reject(err);
              } else {
                resolve(result);
              }
            }
          );
  
          // Pipe the buffer to the Cloudinary upload stream
          uploadStream.end(req.file.buffer);
        });
  
      // Upload to Cloudinary using the promise
      const cloudinaryResult = await cloudinaryUpload();
  
      // Extract the HTTP URL (url) property
      req.profileImageUrl = cloudinaryResult.url;
  
      // Call next middleware
      next();
    } catch (cloudinaryErr) {
      // Handle Cloudinary upload error
      console.error('Cloudinary upload error:', cloudinaryErr);
      return res.status(400).json({
        success: false,
        error: 'Image upload fails',
        details: null,
      });
    }
  });
};

const filldata = asyncHandler(async (req, res, next) => {
  // Call uploadProfileImage middleware to handle image upload
  uploadProfileImage(req, res, async () => {
    const { user_id } = req.body;

    try {
      const user = await User.findOne({ user_id });

      if (!user) {
        throw new CustomError('User not found', 404);
      }

      // Validate required fields
      const { username, firstName, lastName, mobile, address } = req.body;
      if (!username || !firstName || !lastName || !mobile || !address) {
        throw new CustomError('All fields are required', 400);
      }

      // Check for existing username
      const usernameExists = await User.findOne({ username });
      if (usernameExists && usernameExists._id.toString() !== user_id) {
        throw new CustomError('Username already exists', 400);
      }

      // Update user properties
      user.username = username;
      user.firstName = firstName;
      user.lastName = lastName;
      user.phone = mobile;
      user.address = address;
      user.profileImage = {
        url: req.profileImageUrl, // Use the profile image URL from the request
      };

      if (!user.userData) {
        user.userData = [];
      }

      // Generate a new JWT token
      const generatedToken = token(user.user_id);

      // Save the user with the new token
      user.token = generatedToken;
      await user.save();

      // Include the generated token in the response
      res.status(200).json({
        success: true,
        message: 'User updated successfully',
        data: {
          user: {
            user_id: user.user_id,
            email: user.email,
            username: user.username,
            firstName: user.firstName,
            lastName: user.lastName,
            mobile: user.phone,
            address: user.address,
            profileImage: user.profileImage,
            token: generatedToken,
          },
        },
      });
    } catch (error) {
     
      next(error); // Use next to pass the error to the error handling middleware
    }
  });
});



// Register User And send email
const registerUser = asyncHandler(async (req, res, next) => {
  try {
    const { email, password, confirmPassword, username } = req.body;

    // Validate required fields
    if (!email || !password || !confirmPassword) {
      const error = new Error('Please provide all required fields');
      error.statusCode = 400;
      throw error;
    }

    if (password !== confirmPassword) {
      const error = new Error('Passwords do not match');
      error.statusCode = 400;
      throw error;
    }

    delete req.body.confirmPassword;

    // Check if user already exists by email
    const userExistsByEmail = await User.findOne({ email });
    if (userExistsByEmail) {
      const error = new Error('User with this email already exists');
      error.statusCode = 400;
      throw error;
    }

    // If username is provided, check if it's already taken
    if (username) {
      const userExistsByUsername = await User.findOne({ username });
      if (userExistsByUsername) {
        const error = new Error('Username is already taken');
        error.statusCode = 400;
        throw error;
      }
    }

    // Create new user
    const newUser = await User.create(req.body);

    // Generate and save OTP
    const otp = generateOTP(); // Implement this function
    newUser.otp = otp;
    await newUser.save();

    // Send verification email with OTP
    const resetUrl = `Use this ${otp} to verify your email`;
    const emailData = {
      to: email,
      subject: 'Verify Email',
      text: `Use this ${otp} to verify your email`,
      html: resetUrl,
    };
    await sendEmail(emailData, req, res);

    res.status(201).json({
      success: true,
      message: 'User registered successfully. Verification email sent.',
      data: newUser,
    });
  } catch (error) {
    // Handle MongoDB duplicate key errors
    if (error.code === 11000) {
      const field = Object.keys(error.keyPattern)[0];
      let message = '';
      
      // More specific error messages
      if (field === 'email') {
        message = 'User with this email already exists';
      } else if (field === 'username') {
        message = 'Username is already taken';
      } else {
        message = `This ${field} is already in use`;
      }
      
      const duplicateError = new Error(message);
      duplicateError.statusCode = 400;
      return next(duplicateError);
    }

    next(error); // Pass other errors to the error handler
  }
});

// Verify Email Function
const verifyEmail = asyncHandler(async (req, res, next) => {
  try {
    const { email, otp } = req.body;

    // Validate required fields
    if (!email || !otp) {
      const error = new Error('Email and OTP are required');
      error.statusCode = 400;
      throw error;
    }

    // Find the user by email
    const user = await User.findOne({ email });

    // If the user doesn't exist, return an error
    if (!user) {
      const error = new Error('User not found');
      error.statusCode = 404;
      throw error;
    }

    // Check if the provided OTP matches the stored OTP
    if (user.otp !== otp) {
      const error = new Error('Invalid OTP');
      error.statusCode = 400;
      throw error;
    }

    // Check if the OTP is still valid (not expired)
    if (user.otp?.expiresAt && user.otp.expiresAt < new Date()) {
      const error = new Error('OTP has expired. Please request a new one');
      error.statusCode = 400;
      throw error;
    }

    // Mark the email as verified
    user.isEmailVerified = true;

    // Invalidate the OTP
    user.otp = undefined; 

    // Save the updated user
    await user.save();

    // Respond with a success message
    res.status(200).json({
      success: true,
      message: 'Email verification successful',
      data: user
    });
  } catch (error) {
    next(error);
  }
});

// Login User Function
const loginUser = asyncHandler(async (req, res, next) => {
  try {
    const { email, password } = req.body;

    // Validate required fields
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        error: "Email and password are required",
      });
    }
console.log(email)
    // Find user by email
    const user = await User.findOne({ email });

    // Check if user exists
    if (!user) {
      return res.status(401).json({
        success: false,
        error: "Invalid email or password",
      });
    }
console.log('passed')
    // Check if password matches
    const isPasswordMatch = await user.isPasswordMatched(password);
    if (!isPasswordMatch) {
      return res.status(401).json({
        success: false,
        error: "Invalid email or password",
      });
    }
console.log("passed2")
    // Check if email is verified
    // if (!user.isEmailVerified) {
    //   // Generate verification token using your existing method
    //   const verificationToken = await user.createVerificationToken();
    //   await user.save();

    //   // Optional: Send verification email again
    //   // await sendVerificationEmail(user.email, verificationToken);

    //   return res.status(403).json({
    //     success: false,
    //     error: "Please verify your email before logging in",
    //     isEmailVerificationRequired: true,
    //     userId: user.user_id, // Include userId for frontend verification flow
    //   });
    // }

    // Generate a new JWT token
    const generatedToken = token(user.user_id);

    // Assign the generated token to the user object
    user.token = generatedToken;

    // Save the user document with the new token
    await user.save();

    // Return success response with user data
    return res.status(200).json({
      success: true,
      message: "Login successful",
      data: {
        user_id: user.user_id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        username: user.username,
        phone: user.phone,
        address: user.address,
        profileImage: user.profileImage,
        mobile: user.mobile,
        role: user.role,
        token: generatedToken,
      },
    });
  } catch (error) {
    console.error("Login error:", error);

    // Handle error directly
    return res.status(error.statusCode || 500).json({
      success: false,
      error: error.message || "An error occurred during login",
    });
  }
});

// Get All Users Functio
const getAllUser = asyncHandler(async (req, res, next) => {
  try {
    // Implement pagination
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    
    // Count total documents for pagination info
    const totalUsers = await User.countDocuments();
    
    // Find users with pagination
    const users = await User.find()
      .select('-password -token -otp') // Exclude sensitive data
      .skip(skip)
      .limit(limit)
      .sort({ createdAt: -1 });

    // Check if users exist
    if (!users || users.length === 0) {
      const error = new Error('No users found');
      error.statusCode = 404;
      throw error;
    }

    // Return success response with users data and pagination info
    res.status(200).json({
      success: true,
      message: 'Users fetched successfully',
      count: users.length,
      total: totalUsers,
      totalPages: Math.ceil(totalUsers / limit),
      currentPage: page,
      data: users
    });
  } catch (error) {
    next(error);
  }
});


// Create Verification Pin
const createVerificationPin = asyncHandler(async (req, res, next) => {
  try {
    const { user_id, pin } = req.body;

    // Validate required fields
    if (!user_id || !pin) {
      const error = new Error('User ID and PIN are required');
      error.statusCode = 400;
      throw error;
    }

    // Find the user
    const user = await User.findOne({ user_id });

    if (!user) {
      const error = new Error('User does not exist');
      error.statusCode = 403;
      throw error;
    }

    // Check if a pin already exists for the user
    let existingPin = await Pin.findOne({ user_id });

    if (existingPin) {
      // If a pin exists, update the existing pin
      existingPin.pin = pin;
    } else {
      // If no pin exists, create a new pin document
      existingPin = new Pin({
        user_id: user.user_id,
        pin: pin,
      });
    }

    // Save the pin to the database
    await existingPin.save();

    res.status(200).json({ 
      success: true, 
      message: 'PIN created/updated successfully' 
    });
  } catch (error) {
    next(error);
  }
});

// Verify PIN
const verifyPin = asyncHandler(async (req, res, next) => {
  try {
    const { user_id, pin } = req.body;

    // Validate required fields
    if (!user_id || !pin) {
      const error = new Error('User ID and PIN are required');
      error.statusCode = 400;
      throw error;
    }

    // Find the user
    const user = await User.findOne({ user_id });

    if (!user) {
      const error = new Error('User does not exist');
      error.statusCode = 403;
      throw error;
    }

    // Find the PIN for the user
    const storedPin = await Pin.findOne({ user_id });

    if (!storedPin) {
      const error = new Error('PIN not found for the user');
      error.statusCode = 404;
      throw error;
    }

    // Compare the provided PIN with the stored PIN
    if (pin === storedPin.pin) {
      return res.status(200).json({ 
        success: true, 
        message: 'PIN verified successfully',
        data: pin
      });
    } else {
      const error = new Error('Incorrect PIN');
      error.statusCode = 403;
      throw error;
    }
  } catch (error) {
    next(error);
  }
});

// Get Single User
const getUser = asyncHandler(async (req, res, next) => {
  try {
    const { user_id } = req.params;

    if (!user_id) {
      const error = new Error('User ID is required');
      error.statusCode = 400;
      throw error;
    }

    const user = await User.findOne({ user_id }).select('-password -token -otp');

    if (!user) {
      const error = new Error('User not found');
      error.statusCode = 404;
      throw error;
    }

    res.status(200).json({
      success: true,
      message: 'User fetched successfully',
      data: user
    });
  } catch (error) {
    next(error);
  }
});

// Delete User
const deleteUser = asyncHandler(async (req, res, next) => {
  try {
    const { user_id } = req.body;

    if (!user_id) {
      const error = new Error('Invalid user ID');
      error.statusCode = 400;
      throw error;
    }

    const userDeleted = await User.findOneAndDelete({ user_id });

    if (!userDeleted) {
      const error = new Error(`User with ID ${user_id} not found`);
      error.statusCode = 404;
      throw error;
    }

    res.status(200).json({
      success: true,
      message: "User deleted successfully"
    });
  } catch (error) {
    next(error);
  }
});

// Update User
const updateUser = asyncHandler(async (req, res, next) => {
  try {
    const { user_id } = req.user;

    if (!user_id) {
      const error = new Error('User ID is required');
      error.statusCode = 400;
      throw error;
    }

    const updateFields = {
      username: req.body.username,
      email: req.body.email,
      dateOfBirth: req.body.dateOfBirth,
      phoneNumber: req.body.phoneNumber,
      address: req.body.address,
      profileImage: req.body.profileImage,
    };

    // Remove undefined fields
    Object.keys(updateFields).forEach(key => 
      updateFields[key] === undefined && delete updateFields[key]
    );

    if (Object.keys(updateFields).length === 0) {
      const error = new Error('No fields to update');
      error.statusCode = 400;
      throw error;
    }

    const userUpdated = await User.findOneAndUpdate(
      { user_id }, 
      updateFields,
      { new: true }
    );

    if (!userUpdated) {
      const error = new Error(`User with ID ${user_id} not found`);
      error.statusCode = 404;
      throw error;
    }

    res.status(200).json({
      success: true,
      message: 'User updated successfully',
      data: userUpdated
    });
  } catch (error) {
    next(error);
  }
});

// Block User
const blockUser = asyncHandler(async (req, res, next) => {
  try {
    const { user_id } = req.params;

    if (!user_id) {
      const error = new Error('User ID is required');
      error.statusCode = 400;
      throw error;
    }

    const userBlocked = await User.findOneAndUpdate(
      { user_id },
      { isBlocked: true },
      { new: true }
    );

    if (!userBlocked) {
      const error = new Error(`User with ID ${user_id} not found`);
      error.statusCode = 404;
      throw error;
    }

    res.status(200).json({
      success: true, 
      message: 'User blocked successfully',
      data: userBlocked 
    });
  } catch (error) {
    next(error);
  }
});

// Unblock User
const unBlockUser = asyncHandler(async (req, res, next) => {
  try {
    const { user_id } = req.params;

    if (!user_id) {
      const error = new Error('User ID is required');
      error.statusCode = 400;
      throw error;
    }

    const userUnblocked = await User.findOneAndUpdate(
      { user_id },
      { isBlocked: false },
      { new: true }
    );

    if (!userUnblocked) {
      const error = new Error(`User with ID ${user_id} not found`);
      error.statusCode = 404;
      throw error;
    }

    res.status(200).json({
      success: true, 
      message: 'User unblocked successfully',
      data: userUnblocked 
    });
  } catch (error) {
    next(error);
  }
});

// Verify PIN for Password Reset
const passPinVerification = asyncHandler(async (req, res, next) => {
  try {
    const { email, pin } = req.body;

    // Validate required fields
    if (!email || !pin) {
      const error = new Error('Email and PIN are required');
      error.statusCode = 400;
      throw error;
    }

    // Find the user by email
    const user = await User.findOne({ email });
    
    if (!user) {
      const error = new Error('User not found');
      error.statusCode = 404;
      throw error;
    }

    // Check if the provided PIN matches the stored PIN
    if (pin != user.verificationTokenExpires) {
      const error = new Error('Incorrect PIN');
      error.statusCode = 401;
      throw error;
    }

    // Check if the PIN has expired
    const currentTimestamp = Date.now();
    if (user.passwordResetExpires && currentTimestamp > user.passwordResetExpires) {
      const error = new Error('PIN has expired');
      error.statusCode = 401;
      throw error;
    }

    res.status(200).json({ 
      success: true, 
      message: 'PIN verification successful' 
    });
  } catch (error) {
    next(error);
  }
});

// Change Password
const changePassword = asyncHandler(async (req, res, next) => {
  try {
    const { email, password, confirmPassword } = req.body;

    // Validate required fields
    if (!email || !password || !confirmPassword) {
      const error = new Error('Email, password, and confirm password are required');
      error.statusCode = 400;
      throw error;
    }

    if (password !== confirmPassword) {
      const error = new Error('Passwords do not match');
      error.statusCode = 400;
      throw error;
    }

    // Find the user in the database based on the email
    const user = await User.findOne({ email });

    if (!user) {
      const error = new Error('User not found');
      error.statusCode = 404;
      throw error;
    }

    // Update the password
    user.password = password;
    const updatedUser = await user.save();
    
    res.status(200).json({ 
      success: true, 
      message: 'Password changed successfully', 
      data: updatedUser 
    });
  } catch (error) {
    next(error);
  }
});

// Forgot Password
const forgotPasswordToken = asyncHandler(async (req, res, next) => {
  try {
    const { email } = req.body;

    if (!email) {
      const error = new Error('Email is required');
      error.statusCode = 400;
      throw error;
    }

    // Find the user based on the provided email
    const user = await User.findOne({ email });

    if (!user) {
      const error = new Error(`User with email ${email} not found`);
      error.statusCode = 404;
      throw error;
    }

    // Create verification token
    const token = await user.createVerificationToken();
    await user.save();
    
    // Prepare email content
    const resetUrl = `Hi, please follow this link to reset your password. This token is valid for 10 minutes: ${token}`;
    const emailData = {
      to: email,
      subject: 'Forgot Password',
      text: 'hey user',
      html: resetUrl,
    };
    
    // Send email
    await sendEmail(emailData, req, res);
    
    res.status(200).json({
      success: true,
      message: 'Password verification pin sent successfully',
      data: { token }
    });
  } catch (error) {
    next(error);
  }
});



module.exports = {userImageUpdate ,registerUser,loginUser,getAllUser,getUser,deleteUser,updateUser,filldata,blockUser,unBlockUser,changePassword,forgotPasswordToken,passPinVerification ,verifyEmail,createVerificationPin,verifyPin}