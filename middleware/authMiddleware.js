const jwt = require("jsonwebtoken");
const User = require("../model/user");
const asyncHandler = require("express-async-handler");

const authMiddleware = asyncHandler(async (req, res, next) => {
  try {
    // Extract the token from the Authorization header
    const authorizationHeader = req.headers.authorization;
    if (!authorizationHeader || !authorizationHeader.startsWith("Bearer ")) {
      throw new Error("No Token Found In Header");
    }

    const token = authorizationHeader.split(" ")[1];

    // Verify the token using the secret key
    const decoded = jwt.verify(token, process.env.SECRET_KEY);

    // Fetch full user data from database using the ID from token
    const user = await User.findOne({ user_id: decoded.id }).select(
      "-password -token -otp"
    );

    if (!user) {
      throw new Error("Invalid token - user not found");
    }

    // Attach the full user object to the request for later use
    req.user = user;

    // Continue processing the request
    next();
  } catch (error) {
    // Handle authentication errors
    if (error instanceof jwt.TokenExpiredError) {
      throw new Error("Token expired, please log in again");
    } else if (error instanceof jwt.JsonWebTokenError) {
      throw new Error("Invalid token");
    } else {
      throw new Error(error.message || "Authentication failed");
    }
  }
});

const isAdmin = asyncHandler(async (req, res, next) => {
  try {
    // Use the user from authMiddleware instead of searching by email from body
    const user = req.user;

    if (!user) {
      throw new Error("User not authenticated");
    }

    if (user.role !== "admin") {
      throw new Error("User is not an admin");
    }

    // If the user is an admin, proceed to the next middleware/route handler
    next();
  } catch (error) {
    // Handle errors
    throw new Error(error.message);
  }
});

module.exports = { authMiddleware, isAdmin };
