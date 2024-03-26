const User = require('../model/user');
const Pin = require('../model/Pin');
const asyncHandler = require('express-async-handler');
const {token }= require('../config/jwt')
const {validateMongoDbId} = require('../utils/validateMongodbId');
const sendEmail = require('../utils/email')
const cloudinary = require('../utils/cloudinary');
const upload = require('../utils/multerUpload')
function generateOTP() {
  // Generate a 4-digit random OTP
  const otp = Math.floor(1000 + Math.random() * 9000).toString();

  return otp;
}
class CustomError extends Error {
  constructor(message) {
      super(message);
      this.name = 'CustomError';
  }
}

//Image upload with Multer and Cloudinary
// const imageUpload = ('/upload', upload.single('image',function (req,res) {
//   cloudinary.uploader.upload(req.file.path,function(err,result){
//     if (err) {
//       throw new CustomError('Image upload fails', 400);
//     }
//     res.status(201).json({
//       success: true,
//       message: 'User image uploaded successfully..',
//       data: result,
//     });
//   })
// }))
// Express route handler for image upload
const imageUpload = (req, res, next) => {
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

const filldata = asyncHandler(async (req, res, next) => {
  const { user_id } = req.body;

  try {
    // Check if there's a file attached to the request
    if (!req.file) {
      throw new CustomError('Image file is required', 400);
    }

    // Upload image to Cloudinary
    const cloudinaryResult = await new Promise((resolve, reject) => {
      upload.single('image')(req, res, (multerErr) => {
        if (multerErr) {
          return reject(multerErr);
        }

        const uniqueIdentifier = `${Date.now()}_${Math.floor(Math.random() * 1000)}`;
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
        uploadStream.end(req.file.buffer);
      });
    });

    // Extract image URL from Cloudinary result
    const imageUrl = cloudinaryResult.url;

    // Find the user by ID
    const user = await User.findById(user_id);

    if (!user) {
      throw new CustomError('User not found', 404);
    }

    // Extract user data from request body
    const { username, firstName, lastName, mobile, address } = req.body;

    // Validate required fields
    if (!username || !firstName || !lastName || !mobile || !address) {
      throw new CustomError('All fields are required', 400);
    }

    // Check for existing username (excluding the current user)
    const existingUser = await User.findOne({ username, _id: { $ne: user_id } });
    if (existingUser) {
      throw new CustomError('Username already exists', 400);
    }

    // Update user properties
    user.username = username;
    user.firstName = firstName;
    user.lastName = lastName;
    user.phone = mobile;
    user.address = address;
    user.profileImage = { url: imageUrl }; // Set profile image URL

    // Save the updated user
    await user.save();

    // Respond with success message and user data
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
        },
      },
    });
  } catch (error) {
    console.error(error);
    next(error); // Pass the error to the error handling middleware
  }
});



//SignUP USer And send email
const registerUser = asyncHandler(async (req, res, next) => {
  try {
    const { email, password, confirmPassword } = req.body;

    if (password !== confirmPassword) {
      // Change: Use a custom error class for better organization
      throw new CustomError('Passwords do not match', 400);
    }

    delete req.body.confirmPassword;

    const userExist = await User.findOne({ email });

    if (!userExist) {
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
    } else {
      // Change: Use a custom error class for better organization
      throw new CustomError('User already exists', 400);
    }
  } catch (error) {
    console.error(error);
    next(error); // Use next to pass the error to the error handling middleware
  }
});



const verifyEmail = asyncHandler(async (req, res, next) => {
  const { email, otp } = req.body;

  try {
    // Find the user by email
    const user = await User.findOne({ email });

    // If the user doesn't exist, return a custom error
    if (!user) {
      throw new CustomError('User not found', 404);
    }

    // Check if the provided OTP matches the stored OTP
    if (user.otp !== otp) {
      throw new CustomError('Invalid OTP', 400);
    }

    // Check if the OTP is still valid (not expired)
    if (user.otp.expiresAt && user.otp.expiresAt < new Date()) {
      throw new CustomError('Expired OTP', 400);
    }

    // Mark the email as verified
    user.isEmailVerified = true;

    // Invalidate the OTP (mark it as used or remove it)
    user.otp = undefined; // Adjust based on your schema

    // Save the updated user
    await user.save();

    // Respond with a success message
    res.status(200).json({
      success: true,
      message: 'Email verification successful',
      data: user,
    });
  } catch (error) {
    console.error(error);
    next(error); // Use next to pass the error to the error handling middleware
  }
});


// Login User
const loginUser = asyncHandler(async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });

    if (user && (await user.isPasswordMatched(password))) {
      // Generate a new JWT token
      const generatedToken = token(user.user_id);

      // Assign the generated token to the user object
      user.token = generatedToken;

      // Save the user document with the new token
      await user.save();

      res.status(200).json({
        success: true,
        message: 'Login successful',
        data: {
          user_id: user.user_id,
          firstName: user.firstName,
          lastName: user.lastName,
          email: user.email,
          username:user.username,
          phone: user.phone,
          address: user.address,
          profileImage:user.profileImage,
          mobile: user.mobile,
          role:user.role,
          token: generatedToken,
        },
      });
    } else {
      // Provide a more specific error message for login credential issues
      throw new CustomError('Incorrect email or password');
    }
  } catch (error) {
    console.error(error);
    res.status(401).json({
      success: false,
      error: 'Unauthorized',
      message: 'Incorrect email or password',
    });
  }
});

// Get All User In DataBase
const getAllUser = asyncHandler(async (req, res, next) => {
  try {
    const users = await User.find();

    if (!users || users.length === 0) {
      throw new CustomError('Users not found', 404);
    }

    res.status(200).json({
      success: true,
      message: 'Users fetched successfully',
      data: users,
    });
  } catch (error) {
    console.error(error);
    next(error);
  }
});


//Create Verification pin
const createVerificationPin = asyncHandler(async (req, res, next) => {
  const { user_id, pin } = req.body;

  try {
    // Assuming you have a User model defined
    const user = await User.findOne({user_id });

    if (!user) {
      // Change: Use a custom error class for better organization
      throw new CustomError('User does not exist', 403);
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

    res.status(200).json({ success: true, message: 'Pin created/updated successfully' });
  } catch (error) {
    console.error('Error saving pin:', error);
    next(error); // Use next to pass the error to the error handling middleware
  }
});

// Create a function to handle PIN verification
const verifyPin = asyncHandler(async (req, res, next) => {
  const { user_id, pin } = req.body;

  try {
    // Find the user with the provided user_id
    const user = await User.findOne({ user_id });

    if (!user) {
      // Change: Use a custom error class for better organization
      throw new CustomError('User does not exist', 403);
    }

    // Find the PIN for the user
    const storedPin = await Pin.findOne({ user_id });

    if (!storedPin) {
      // Change: Use a custom error class for better organization
      throw new CustomError('PIN not found for the user', 404);
    }

    // Compare the provided PIN with the stored PIN
    if (pin === storedPin.pin) {
      return res.status(200).json({ success: true, message: 'PIN verified successfully' ,data:pin});
    } else {
      // Change: Use a custom error class for better organization
      throw new CustomError('Incorrect PIN', 403);
    }
  } catch (error) {
    console.error(error);
    next(error); // Use next to pass the error to the error handling middleware
  }
});

//Get Single User In DataBase
const getUser = asyncHandler(async (req, res, next) => {
  const { user_id } = req.params;

  try {
    

    const user = await User.findOne(user_id);

    if (!user) {
      throw new CustomError('User not found', 404);
    }

    res.status(200).json({
      success: true,
      message: 'User fetched successfully',
      data: user,
    });
  } catch (error) {
    console.error(error);
    next(error);
  }
});


//Delete User
const deleteUser = asyncHandler(async (req, res, next) => {
  const { user_id } = req.body;
  console.log(req.body);

  try {
    console.log(user_id)
    // Check if user_id is undefined or null
    if (!user_id) {
      throw new CustomError('Invalid user ID', 400);
    }

    const userDeleted = await User.findOneAndDelete({ user_id });

    if (!userDeleted) {
      throw new CustomError(`User with ID ${user_id} not found`, 404);
    }

    console.log(`User with ID ${user_id} deleted`);
    res.json({
      success: true,
      message: "User Deleted"
    });
  } catch (error) {
    console.error(error);
    next(error); // Use next to pass the error to the error handling middleware
  }
});



//update User
const updateUser = asyncHandler(async (req, res, next) => {
  const { user_id } = req.user;

  try {
    const updateFields = {
      username: req.body.username,
      email: req.body.email,
      dateOfBirth: req.body.dateOfBirth,
      phoneNumber: req.body.phoneNumber,
      address: req.body.address,
      profileImage: req.body.profileImage,
    };

    const userUpdated = await User.findOneAndUpdate( user_id , updateFields, {
      new: true,
    });

    if (!userUpdated) {
      throw new CustomError(`User with ID ${user_id} not found`, 404);
    }

    console.log(`User with ID ${user_id} Updated`);
    res.status(200).json({
      success: true,
      message: 'User updated successfully',
      data: userUpdated,
    });
  } catch (error) {
    console.error(error);
    next(error); // Use next to pass the error to the error handling middleware
  }
});


//UnBlock User
const blockUser = asyncHandler(async (req, res, next) => {
  const { user_id } = req.params;
  

  try {
    const userblocked = await User.findOneAndUpdate(user_id, {
      isBlocked: true,
    }, {
      new: true
    });

    if (!userblocked) {
      // Change: Use a custom error class for better organization
      throw new CustomError(`User with ID ${user_id} not found`, 404);
    }

    console.log(`User with ID ${user_id} blocked`);
    res.json({success: true, message: 'User blocked',data:userblocked });
  } catch (error) {
    console.error(error);
    next(error); // Use next to pass the error to the error handling middleware
  }
});


//UnBlock User
const unBlockUser = asyncHandler(async (req, res, next) => {
  const { user_id } = req.params;
  

  try {
    const userUnblocked = await User.findOneAndUpdate(user_id, {
      isBlocked: false,
    }, {
      new: true
    });

    if (!userUnblocked) {
      // Change: Use a custom error class for better organization
      throw new CustomError(`User with ID ${user_id} not found`, 404);
    }

    console.log(`User with ID ${user_id} unblocked`);
    res.json({success: true, message: 'User Unblocked',data:userUnblocked });
  } catch (error) {
    console.error(error);
    next(error); // Use next to pass the error to the error handling middleware
  }
});



//

const passPinVerification = asyncHandler(async(req,res)=>{
  const { email, pin } = req.body;

  // Validate request parameters
  if (!email || !pin) {
    return res.status(400).json({ success: false, error: 'Email and PIN are required' });
  }

  try {
    // Find the user by email
    const user = await User.findOne( {email} );
    console.log(user.verificationTokenExpires)
    
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }
    console.log('this worked')
    // Check if the provided PIN matches the stored PIN
    if (pin != user.verificationTokenExpires) {
      return res.status(401).json({ success: false, error: 'Incorrect PIN' });
    };

    // Check if the PIN has expired
    const currentTimestamp = Date.now();
    if (user.passwordResetExpires && currentTimestamp > user.passwordResetExpires) {
      return res.status(401).json({ success: false, error: 'PIN has expired' });
    }

    // PIN is correct, you can implement further actions here

    // For demonstration purposes, let's send a success response
    return res.status(200).json({ success: true, message: 'PIN verification successful' });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ success: false, error: 'Internal Server Error' });
  }
}) 

const changePassword = asyncHandler(async (req, res, next) => {
  try {
    // Assuming you want to get the new password and email from the request body
    const { email, password, confirmPassword } = req.body;

    if (password !== confirmPassword) {
      return res.status(400).json({
        success: false,
        error: 'Passwords do not match',
      });
    }

    delete req.body.confirmPassword;
    // Find the user in the database based on the email
    const user = await User.findOne({ email });

    // If the user is not found, throw a custom error
    if (!user) {
      throw new CustomError('User not found', 404);
    }

    // Update the password if a new one is provided
    if (password) {
      user.password = password;
      const updatedUser = await user.save();
      res.json({ success: 'True', message: 'Password changed', data:updatedUser });
    } else {
      // If password is not provided, throw a custom error
      throw new CustomError('Password not provided', 400);
    }
  } catch (error) {
    console.error(error);
    next(new CustomError('Internal Server Error', 500));
  }
});

const forgotPasswordToken = asyncHandler(async (req, res, next) => {
  try {
    const { email } = req.body;

    console.log('Received request for email:', email);

    // Find the user based on the provided email
    const user = await User.findOne({ email });

    // If the user is not found, throw a custom error
    if (!user) {
      throw new CustomError(`User with ${email} not found`, 404);
    }

    console.log(user);
    const token = await user.createVerificationToken();
    await user.save(); 
    const resetUrl = `Hi, please follow this link to reset your password. This token is valid for 10 minutes ${token}`;
    const emailData = {
      to: email,
      subject: 'Forgot Password',
      text: 'hey user',
      htm: resetUrl,
    };
    await sendEmail(emailData, req, res); // pass the data to email create
    return res.status(200).json({
      success: true,
      message: 'Password verification pin sent successfully',
      data: { token: token}, // Replace 'your_token_value' with the actual token
    });
;
  } catch (error) {
    console.error(error);
    next(new CustomError('Internal Server Error', 500));
  }
});


module.exports = {imageUpload ,registerUser,loginUser,getAllUser,getUser,deleteUser,updateUser,filldata,blockUser,unBlockUser,changePassword,forgotPasswordToken,passPinVerification ,verifyEmail,createVerificationPin,verifyPin}