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

const userImageUpdate = asyncHandler(async (req, res, next) => {
  upload.single("image")(req, res, async (multerErr) => {
    if (multerErr) {
      // Handle multer upload error
      return next(multerErr);
    }

    try {
      // Get user_id from the authenticated user (from cookie token)
      const user_id = req.user.user_id;

      if (!user_id) {
        throw new CustomError("User ID not found in token", 401);
      }

      // Check if image was uploaded
      if (!req.file) {
        throw new CustomError("No image file uploaded", 400);
      }

      // Find the user
      const user = await User.findOne({ user_id });

      if (!user) {
        throw new CustomError("User not found", 404);
      }

      // Generate a unique identifier for Cloudinary
      const uniqueIdentifier = `${Date.now()}_${Math.floor(
        Math.random() * 1000
      )}`;

      // Create a promise for Cloudinary upload
      const cloudinaryUpload = () =>
        new Promise((resolve, reject) => {
          const uploadStream = cloudinary.uploader.upload_stream(
            { public_id: uniqueIdentifier, folder: "profileImage" },
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

      // Extract the HTTP URL
      const httpUrl = cloudinaryResult.url;

      // Update user's profile image in database
      user.profileImage = {
        url: httpUrl,
      };

      await user.save();

      // Respond with success and updated user profile
      res.status(200).json({
        success: true,
        message: "Profile image updated successfully",
        data: {
          user_id: user.user_id,
          profileImage: {
            url: httpUrl,
          },
          imageUrl: httpUrl,
        },
      });
    } catch (error) {
      // Handle any errors
      console.error("Image upload error:", error);
      next(error);
    }
  });
});


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


// const uploadImage = asyncHandler(async (req, res, next) => {
//   // Call uploadProfileImage middleware to handle image upload
//   uploadProfileImage(req, res, async () => {
//     try {
//       // Get user_id from the authenticated user (set by authMiddleware)
//       const user_id = req.user.user_id;

//       if (!user_id) {
//         throw new CustomError("User ID not found in token", 401);
//       }

//       // Check if image was uploaded
//       if (!req.profileImageUrl) {
//         throw new CustomError("No image uploaded", 400);
//       }

//       // Find the user
//       const user = await User.findOne({ user_id });

//       if (!user) {
//         throw new CustomError("User not found", 404);
//       }

//       // Update only the profile image
//       user.profileImage = {
//         url: req.profileImageUrl,
//       };

//       await user.save();

//       // Return success response
//       res.status(200).json({
//         success: true,
//         message: "Profile image uploaded successfully",
//         data: {
//           user_id: user.user_id,
//           profileImage: user.profileImage,
//           imageUrl: req.profileImageUrl,
//         },
//       });
//     } catch (error) {
//       next(error);
//     }
//   });
// });

const filldata = asyncHandler(async (req, res, next) => {
  try {
    // Get user_id from the authenticated user (set by authMiddleware)
    const user_id = req.user.user_id;
    console.log("=== FILLDATA STRICT VALIDATION ===");
    console.log("Request body:", req.body);

    if (!user_id) {
      throw new CustomError("User ID not found in token", 401);
    }

    const user = await User.findOne({ user_id });

    if (!user) {
      throw new CustomError("User not found", 404);
    }

    // Extract ALL required fields from request body
    const { username, firstName, lastName, mobile, address, city, state } =
      req.body;

    // STRICT VALIDATION: ALL FIELDS ARE REQUIRED
    const requiredFields = {
      username: username,
      firstName: firstName,
      lastName: lastName,
      mobile: mobile,
      address: address,
      city: city,
      state: state,
    };

    // Check for missing or empty fields
    const missingFields = [];
    const emptyFields = [];

    for (const [fieldName, fieldValue] of Object.entries(requiredFields)) {
      if (fieldValue === undefined || fieldValue === null) {
        missingFields.push(fieldName);
      } else if (typeof fieldValue === "string" && fieldValue.trim() === "") {
        emptyFields.push(fieldName);
      }
    }

    // Throw error if any field is missing or empty
    if (missingFields.length > 0) {
      throw new CustomError(
        `Missing required fields: ${missingFields.join(", ")}`,
        400
      );
    }

    if (emptyFields.length > 0) {
      throw new CustomError(
        `Empty required fields: ${emptyFields.join(", ")}`,
        400
      );
    }

    console.log("✅ All required fields validated successfully");

    // Trim all string fields
    const trimmedData = {
      username: username.trim(),
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      mobile: mobile.trim(),
      address: address.trim(),
      city: city.trim(),
      state: state.trim(),
    };

    console.log("Trimmed data:", trimmedData);

    // Additional validation for specific fields
    if (trimmedData.username.length < 3 || trimmedData.username.length > 30) {
      throw new CustomError(
        "Username must be between 3 and 30 characters",
        400
      );
    }

    if (trimmedData.firstName.length > 100) {
      throw new CustomError("First name cannot exceed 100 characters", 400);
    }

    if (trimmedData.lastName.length > 100) {
      throw new CustomError("Last name cannot exceed 100 characters", 400);
    }

    if (trimmedData.city.length > 100) {
      throw new CustomError("City name cannot exceed 100 characters", 400);
    }

    if (trimmedData.state.length > 100) {
      throw new CustomError("State name cannot exceed 100 characters", 400);
    }

    // Check for existing username (exclude current user)
    const usernameExists = await User.findOne({
      username: trimmedData.username,
      user_id: { $ne: user_id },
    });

    if (usernameExists) {
      throw new CustomError("Username already exists", 400);
    }

    console.log("=== UPDATING USER FIELDS ===");

    // Store original values for comparison
    const originalData = {
      username: user.username,
      firstName: user.firstName,
      lastName: user.lastName,
      phone: user.phone,
      address: user.address,
      city: user.city,
      state: user.state,
    };

    // Update user properties with trimmed data
    user.username = trimmedData.username;
    user.firstName = trimmedData.firstName;
    user.lastName = trimmedData.lastName;
    user.phone = trimmedData.mobile;
    user.address = trimmedData.address;
    user.city = trimmedData.city;
    user.state = trimmedData.state;

    console.log("=== BEFORE SAVE VERIFICATION ===");
    console.log("user.username:", user.username);
    console.log("user.firstName:", user.firstName);
    console.log("user.lastName:", user.lastName);
    console.log("user.phone:", user.phone);
    console.log("user.address:", user.address);
    console.log("user.city:", user.city);
    console.log("user.state:", user.state);

    // Verify all fields are set correctly before saving
    const fieldsToVerify = {
      username: user.username,
      firstName: user.firstName,
      lastName: user.lastName,
      phone: user.phone,
      address: user.address,
      city: user.city,
      state: user.state,
    };

    for (const [fieldName, fieldValue] of Object.entries(fieldsToVerify)) {
      if (!fieldValue || fieldValue.trim() === "") {
        throw new CustomError(
          `Field ${fieldName} is empty after assignment`,
          500
        );
      }
    }

    if (!user.userData) {
      user.userData = [];
    }

    // Generate a new JWT token
    const generatedToken = token(user.user_id);
    user.token = generatedToken;

    console.log("=== ATTEMPTING TO SAVE USER ===");

    try {
      // Use findOneAndUpdate for more reliable saving
      const savedUser = await User.findOneAndUpdate(
        { user_id: user_id },
        {
          username: trimmedData.username,
          firstName: trimmedData.firstName,
          lastName: trimmedData.lastName,
          phone: trimmedData.mobile,
          address: trimmedData.address,
          city: trimmedData.city,
          state: trimmedData.state,
          token: generatedToken,
        },
        {
          new: true,
          runValidators: true,
          returnDocument: "after",
        }
      );

      if (!savedUser) {
        throw new CustomError("Failed to update user", 500);
      }

      console.log("✅ USER SAVED SUCCESSFULLY");
      console.log("Saved user city:", savedUser.city);
      console.log("Saved user state:", savedUser.state);

      // Verify all fields were saved correctly
      const verificationFields = {
        username: {
          expected: trimmedData.username,
          actual: savedUser.username,
        },
        firstName: {
          expected: trimmedData.firstName,
          actual: savedUser.firstName,
        },
        lastName: {
          expected: trimmedData.lastName,
          actual: savedUser.lastName,
        },
        phone: { expected: trimmedData.mobile, actual: savedUser.phone },
        address: { expected: trimmedData.address, actual: savedUser.address },
        city: { expected: trimmedData.city, actual: savedUser.city },
        state: { expected: trimmedData.state, actual: savedUser.state },
      };

      const savingErrors = [];
      for (const [fieldName, { expected, actual }] of Object.entries(
        verificationFields
      )) {
        if (expected !== actual) {
          savingErrors.push(
            `${fieldName}: expected "${expected}", got "${actual}"`
          );
        }
      }

      if (savingErrors.length > 0) {
        console.error("❌ SAVING VERIFICATION FAILED:", savingErrors);
        throw new CustomError(
          `Data saving verification failed: ${savingErrors.join(", ")}`,
          500
        );
      }

      console.log("✅ ALL FIELDS SAVED AND VERIFIED SUCCESSFULLY");

      // Include ALL fields in the response
      res.status(200).json({
        success: true,
        message: "User updated successfully",
        data: {
          user_id: savedUser.user_id,
          email: savedUser.email,
          username: savedUser.username,
          firstName: savedUser.firstName,
          lastName: savedUser.lastName,
          phone: savedUser.phone,
          address: savedUser.address,
          city: savedUser.city,
          state: savedUser.state,
          profileImage: savedUser.profileImage,
          token: generatedToken,
        },
      });
    } catch (saveError) {
      console.error("❌ ERROR SAVING USER:", saveError);
      if (saveError.name === "ValidationError") {
        const validationErrors = Object.values(saveError.errors).map(
          (err) => err.message
        );
        throw new CustomError(
          `Validation failed: ${validationErrors.join(", ")}`,
          400
        );
      }
      throw new CustomError(
        `Failed to save user data: ${saveError.message}`,
        500
      );
    }
  } catch (error) {
    console.error("❌ FILLDATA ERROR:", error);
    next(error);
  }
});

// const filldata = asyncHandler(async (req, res, next) => {
//   // Call uploadProfileImage middleware to handle image upload
//   uploadProfileImage(req, res, async () => {
//     const { user_id } = req.body;

//     try {
//       const user = await User.findOne({ user_id });

//       if (!user) {
//         throw new CustomError('User not found', 404);
//       }

//       // Validate required fields
//       const { username, firstName, lastName, mobile, address } = req.body;
//       if (!username || !firstName || !lastName || !mobile || !address) {
//         throw new CustomError('All fields are required', 400);
//       }

//       // Check for existing username
//       const usernameExists = await User.findOne({ username });
//       if (usernameExists && usernameExists._id.toString() !== user_id) {
//         throw new CustomError('Username already exists', 400);
//       }

//       // Update user properties
//       user.username = username;
//       user.firstName = firstName;
//       user.lastName = lastName;
//       user.phone = mobile;
//       user.address = address;
//       user.profileImage = {
//         url: req.profileImageUrl, // Use the profile image URL from the request
//       };

//       if (!user.userData) {
//         user.userData = [];
//       }

//       // Generate a new JWT token
//       const generatedToken = token(user.user_id);

//       // Save the user with the new token
//       user.token = generatedToken;
//       await user.save();

//       // Include the generated token in the response
//       res.status(200).json({
//         success: true,
//         message: 'User updated successfully',
//         data: {
//           user: {
//             user_id: user.user_id,
//             email: user.email,
//             username: user.username,
//             firstName: user.firstName,
//             lastName: user.lastName,
//             mobile: user.phone,
//             address: user.address,
//             profileImage: user.profileImage,
//             token: generatedToken,
//           },
//         },
//       });
//     } catch (error) {
     
//       next(error); // Use next to pass the error to the error handling middleware
//     }
//   });
// });



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
// In your user-info endpoint
const getUser = asyncHandler(async (req, res) => {
  try {
    const user_id = req.user.user_id;

    // Make sure to select all fields including profileImage
    const user = await User.findOne({ user_id }).select(
      "-password -refreshToken -token -otp"
    );

    if (!user) {
      throw new CustomError("User not found", 404);
    }

    console.log("=== USER FROM DB ===");
    console.log("Full user object:", user);
    console.log("ProfileImage:", user.profileImage);

    res.status(200).json({
      success: true,
      message: "User fetched successfully",
      data: user,
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



module.exports = {
  userImageUpdate,
  registerUser,
  loginUser,
  getAllUser,
  getUser,
  deleteUser,
  updateUser,
  filldata,
  blockUser,
  unBlockUser,
  changePassword,
  forgotPasswordToken,
  passPinVerification,
  verifyEmail,
  createVerificationPin,
  verifyPin,
};