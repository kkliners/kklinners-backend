const User = require('../model/user');
const asyncHandler = require('express-async-handler');
const {token }= require('../config/jwt')
const {validateMongoDbId} = require('../utils/validateMongodbId');
const sendEmail = require('../utils/email')
const cloudinary = require('../utils/cloudinary');
function generateOTP() {
  // Generate a 4-digit random OTP
  const otp = Math.floor(1000 + Math.random() * 9000).toString();

  return otp;
}

//SignUP USer And send email
const registerUser = asyncHandler(async (req, res) => {
  try {
    const { email, password, confirmPassword } = req.body;

    if (password !== confirmPassword) {
      return res.status(400).json({
        success: false,
        error: 'Passwords do not match',
      });
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
      res.status(400).json({
        success: false,
        error: 'User already exists',
      });
    }
  } catch (error) {
    console.error(error);

    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      details: error.message || error,
    });
  }
});



const verifyEmail = asyncHandler(async (req, res) => {
  const { email, otp } = req.body;

  try {
    // Find the user by email
    const user = await User.findOne({ email });

    // If the user doesn't exist, return an error
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found',
      });
    }

    // Check if the provided OTP matches the stored OTP
    if (user.otp !== otp) {
      return res.status(400).json({
        success: false,
        error: 'Invalid OTP',
      });
    }

    // Check if the OTP is still valid (not expired)
    if (user.otp.expiresAt && user.otp.expiresAt < new Date()) {
      return res.status(400).json({
        success: false,
        error: 'Expired OTP',
      });
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

    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      details: error.message || error,
    });
  }
});



// Login User
const loginUser = asyncHandler(async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });

    if (user && (await user.isPasswordMatched(password))) {
      // Generate a new JWT token
      const generatedToken = token(user._id);

      // Assign the generated token to the user object
      user.token = generatedToken;

      // Save the user document with the new token
      await user.save();

      res.status(200).json({
        success: true,
        message: 'Login successful',
        data: {
          _id: user._id,
          firstname: user.firstname,
          lastname: user.lastname,
          email: user.email,
          mobile: user.mobile,
          token: generatedToken,
        },
      });
    } else {
      throw new Error('Login details incorrect');
    }
  } catch (error) {
    console.error(error);

    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      details: error.message || error,
    });
  }
});

// filldata user after login and register
const filldata = asyncHandler(async (req, res) => {
  try {
    const userId = req.body;
    validateMongoDbId(userId);

    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    // Validate required fields
    const { username, firstName, lastName, mobile, address, profileImage } = req.body;
    if (!username || !firstName || !lastName || !mobile || !address) {
      return res.status(400).json({
        success: false,
        error: 'All fields (username, firstName, lastName, mobile, address) are required',
      });
    }

    const img = await cloudinary.uploader.upload(profileImage, {
      folder: 'profileImage',
    });
    console.log(img)
    // Check for existing username
    const usernameExists = await User.findOne({ username });
    if (usernameExists && usernameExists._id.toString() !== userId) {
      return res.status(400).json({
        success: false,
        error: 'Username already exists',
      });
    }

    // Update user properties
    user.username = username;
    user.firstName = firstName;
    user.lastName = lastName;
    user.phone = mobile;
    user.address = address;
    user.profileImage = { // Assign object properties directly
      public_id: img.public_id,
      url: img.secure_url,
    };

    // Reconsider the purpose of 'userData' array
    // If it's not essential, remove this section
    if (!user.userData) {
      user.userData = [];
    }
    // user.userData.push({ ... }); // Potentially unnecessary

    await user.save();

    res.status(200).json({
      success: true,
      message: 'User updated successfully',
      data: user,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      details: error.message || error,
    });
  }
});

//Get All User In DataBase
const getAllUser= asyncHandler(async(req,res)=>{
    
    try {
        const users = await User.find();
        res.status(200).json(users) 
    } catch (error) {
        throw new Error("Users Not Found")
    }
})


//Get Single User In DataBase
const getUser= asyncHandler(async(req,res)=>{
    const {id} = req.params;
    
    try {
        validateMongoDbId(id)
        const user = await User.findById(id);
        res.status(200).json(user) 
    } catch (error) {
        throw new Error(error)
    }
})


//Delete User
const deleteUser= asyncHandler(async(req,res)=>{
    const {id} = req.params;
    validateMongoDbId(id)
    try {
        const userDeleted = await User.findByIdAndDelete(id);

    if (!userDeleted) {
      return res.status(404).json({status:false, message: `User with ID ${id} not found` });
    }

    console.log(`User with ID ${id} deleted`);
    res.json({status:true,
    message: "User Deleted"});
    } catch (error) {
        throw new Error(error)
    }
})


//update User
const updateUser= asyncHandler(async(req,res)=>{
    const {id} = req.user;
    validateMongoDbId(id)
    try {
        const userupdated = await User.findByIdAndUpdate(id,{
            username:req?.body.username,
            email: req?.body?.email,
            dateOfBirth:req?.body?.dateOfBirth,
            phoneNumber:req?.body?.phoneNumber,
            address:req?.body?.address,
            profileImage:req?.body?.profileImage,
        },{
            new:true
        });

    if (!userupdated) {
      return res.status(404).json({ message: `User with ID ${id} not found` });
    }

    console.log(`User with ID ${id} Updated`);
    res.json(userupdated);
    } catch (error) {
        throw new Error(error)
    }
})



//UnBlock User
const blockUser= asyncHandler(async(req,res)=>{
    const {id} = req.params;
    validateMongoDbId(id)
    try {
        const userblocked= await User.findByIdAndUpdate(id,{
            isBlocked:true,
        },{
            new:true
        });

    if (!userblocked) {
      return res.status(404).json({ message: `User with ID ${id} not found` });
    }

    console.log(`User with ID ${id} blocked`);
    res.json({message:'User blocked',});
    } catch (error) {
        throw new Error(error)
    }
})



//UnBlock User
const unBlockUser= asyncHandler(async(req,res)=>{
    const {id} = req.params;
    validateMongoDbId(id)
    try {
        const userblocked= await User.findByIdAndUpdate(id,{
            isBlocked:false,
        },{
            new:true
        });

    if (!userblocked) {
      return res.status(404).json({ message: `User with ID ${id} not found` });
    }

    console.log(`User with ID ${id} unblocked`);
    res.json({message:`User unblocked`});
    } catch (error) {
        throw new Error(error)
    }
})

const veriffyPin = asyncHandler(async(req,res)=>{
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


const changePassword = asyncHandler(async (req, res) => {
  try {
    // Assuming you want to get the new password and email from the request body
    const { password, email } = req.body;

    // Find the user in the database based on the email
    const user = await User.findOne({ email });

    // If the user is not found, return an error
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Update the password if a new one is provided
    if (password) {
      user.password = password;
      const updatedUser = await user.save();
      res.json(updatedUser);
    } else {
      res.status(400).json({ message: 'Password not provided' });
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal Server Error' });
  }
});


const forgotPasswordToken = asyncHandler(async (req, res) => {
  const { email } = req.body;

  console.log('Received request for email:', email);

  // Find the user based on the provided email
  const user = await User.findOne({ email });

  if (!user) {
     // Return a user-friendly response if user not found
     return res.status(404).json({ error: `User with ${email} not found` });
  }
  console.log(user);
  try {
     const token = await user.createVerificationToken();
     await user.save(); 
     const resetUrl = `Hi, please follow this link to reset your password. This token is valid for 10 minutes ${token}`;
     const emailData = {
        to: email,
        subject: 'Forgot Password',
        text: 'hey user',
        htm: resetUrl,
     };
     await sendEmail(emailData, req, res);//pass the data to email create
     res.json(token);
  } catch (error) {
     throw new Error(error);
     // res.status(500).json({ error: 'An error occurred' });
  }
});

// const otp = await user.createVerificationToken();
//      await user.save(); 
//      const resetUrl = `Use this ${token} to verify your email`;
//      const emailData = {
//         to: email,
//         subject: 'verify Email',
//         text: 'hey user',
//         htm: resetUrl,
//      };
//      await sendEmail(emailData, req, res);//pass the data to email create
//      res.json(token);

module.exports = {registerUser,loginUser,getAllUser,getUser,deleteUser,updateUser,filldata,blockUser,unBlockUser,changePassword,forgotPasswordToken,veriffyPin ,verifyEmail}