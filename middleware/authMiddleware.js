const jwt = require('jsonwebtoken');
const User = require('../model/user');
const asyncHandler = require('express-async-handler');

const authMiddleware = asyncHandler(async (req, res, next) => {
  try {
    // Extract the token from the Authorization header
    const authorizationHeader = req.headers.authorization;
    if (!authorizationHeader || !authorizationHeader.startsWith('Bearer ')) {
      throw new Error('No Token Found In Header');
    }
    
    const token = authorizationHeader.split(' ')[1];

    // Verify the token using the secret key
    const decoded = jwt.verify(token, process.env.SECRET_KEY);

    // Attach the user information from the token to the request for later use
    req.user = decoded;

    // Continue processing the request
    next();
  } catch (error) {
    // Handle authentication errors
    if (error instanceof jwt.TokenExpiredError) {
      throw new Error('Token expired, please log in again');
    } else if (error instanceof jwt.JsonWebTokenError) {
      throw new Error('Invalid token');
    } else {
      throw new Error('Authentication failed');
    }
  }
});

// const isAdmin = asyncHandler(async(req,res,next)=>{
//   const {email} = req.body;
//   const admin = await User.findById({email});
//   if (admin.role !== "admin") {
//     throw new Error("User Not Admin")
//   }else{
//     next()
//   }

// })

const isAdmin = asyncHandler(async (req, res, next) => {
  try {
    const { email } = req.body;
    const admin = await User.findOne({ email });

   

    if (admin && admin.role !== "admin") {
      throw new Error("User is not an admin");
    }
    else{

    // If the user is an admin, proceed to the next middleware/route handler
    next();
    }

  } catch (error) {
    // Handle errors, such as user not found or not being an admin
    throw new Error(error);
  }
});

module.exports = {authMiddleware,isAdmin};
