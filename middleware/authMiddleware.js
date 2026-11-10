const jwt = require("jsonwebtoken");
const User = require("../model/user");
const asyncHandler = require("express-async-handler");

const httpError = (message, statusCode) => Object.assign(new Error(message), { statusCode });

const authMiddleware = asyncHandler(async (req, res, next) => {
  try {
    // Extract the token from the Authorization header
    const authorizationHeader = req.headers.authorization;
    if (!authorizationHeader || !authorizationHeader.startsWith("Bearer ")) {
      throw httpError("No Token Found In Header", 401);
    }

    const token = authorizationHeader.split(" ")[1];

    // Verify the token using the secret key
    const decoded = jwt.verify(token, process.env.SECRET_KEY);

    // Fetch full user data from database using the ID from token
    const user = await User.findOne({ user_id: decoded.id }).select(
      "-password -token -otp"
    );

    if (!user) {
      throw httpError("Invalid token - user not found", 401);
    }

    // Attach the full user object to the request for later use
    req.user = user;

    // Continue processing the request
    next();
  } catch (error) {
    // Handle authentication errors
    if (error instanceof jwt.TokenExpiredError) {
      throw httpError("Token expired, please log in again", 401);
    } else if (error instanceof jwt.JsonWebTokenError) {
      throw httpError("Invalid token", 401);
    } else {
      throw httpError(error.message || "Authentication failed", error.statusCode || 401);
    }
  }
});

const isAdmin = asyncHandler(async (req, res, next) => {
  try {
    // Use the user from authMiddleware instead of searching by email from body
    const user = req.user;

    if (!user) {
      throw httpError("User not authenticated", 401);
    }

    if (user.role !== "admin") {
      throw httpError("User is not an admin", 403);
    }

    // If the user is an admin, proceed to the next middleware/route handler
    next();
  } catch (error) {
    throw httpError(error.message, error.statusCode || 403);
  }
});

module.exports = { authMiddleware, isAdmin };
