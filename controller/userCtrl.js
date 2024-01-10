const User = require('../model/user');
const asyncHandler = require('express-async-handler');
const {token }= require('../config/jwt')
const {validateMongoDbId} = require('../utils/validateMongodbId');
const sendEmail = require('../utils/email')


//register user
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
  
        res.status(201).json({
          success: true,
          message: 'User registered successfully',
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

      // Validate that all required fields are present in the request body
      const { username, firstName, lastName, mobile, address } = req.body;
      if (!username || !firstName || !lastName || !mobile || !address) {
          return res.status(400).json({
              success: false,
              error: 'All fields (username, firstName, lastName, mobile, address) are required',
          });
      }

      // Check if the provided username already exists
      const usernameExists = await User.findOne({ username });
      if (usernameExists && usernameExists._id.toString() !== userId) {
          return res.status(400).json({
              success: false,
              error: 'Username already exists',
          });
      }

      // Update user properties based on the request body
      user.username = username;
      user.firstName = firstName;
      user.lastName = lastName;
      user.phone = mobile;
      user.address = address;

      // Assuming 'userData' is an array in your schema
      if (!user.userData) {
          user.userData = [];
      }

      // Add the existing user data to the 'userData' array
      user.userData.push({
        username: user.username,
        firstName: user.firstName,
        lastName: user.lastName,
        mobile: user.mobile,
        address: user.address,
    });

      // Save the updated user document
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
    if (pin != user.verificationPin) {
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
  const { id } = req.body; // Assuming the parameter is named 'id'
  validateMongoDbId(id);

  // Assuming you want to get the new password from the request body
  const { password } = req.body;

  const user = await User.findById(id);

  if (password) {
    user.password = password;
    const updatedPassword = await user.save();
    res.json(updatedPassword);
  } else {
    res.json(user);
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
// const resetPassword = asyncHandler(async (req, res) => {
//   const { password } = req.body;
//   const { token } = req.params;
//   const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

//   const user = await User.findOne({
//     passwordResetToken: hashedToken,
//     passwordResetExpires: { $gt: Date.now() }, // Use Date.now() instead of Date.name()
//   });

//   if (!user) {
//     throw new Error('Token expired, please try again later');
//   }

//   user.password = password;
//   user.passwordResetToken = undefined;
//   user.passwordResetExpires = undefined;

//   await user.save();

//   // Respond with a more generic message or omit the response data for security reasons
//   res.json({ message: 'Password reset successful' });
// });



//Send a four digit token instead and veriffy email
module.exports = {registerUser,loginUser,getAllUser,getUser,deleteUser,updateUser,filldata,blockUser,unBlockUser,changePassword,forgotPasswordToken,veriffyPin }