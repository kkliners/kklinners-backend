// routes/cleaningRoutes.js
const express = require("express");
const router = express.Router();
const {
  createHouseCleaningService,
  getCleaningOptions,
  calculatePrice,
  verifyCleaningPayment,
} = require("../controller/house-cleaning");

// Import your auth middleware
const authMiddleware = require("../middleware/authMiddleware");

// Public routes (no authentication required)

// GET /api/v1/cleaning/options - Get cleaning categories, packages, home sizes, and frequencies
router.get("/options", getCleaningOptions);

// POST /api/v1/cleaning/calculate-price - Calculate price for cleaning service
router.post("/calculate-price", calculatePrice);

// Protected routes (authentication required)

// POST /api/v1/cleaning/book - Create/book house cleaning service
router.post("/book",  createHouseCleaningService);

// POST /api/v1/cleaning/verify-payment - Verify cleaning service payment
router.post("/verify-payment",authMiddleware,  verifyCleaningPayment);

// Alternative routes for backward compatibility
router.post("/create",authMiddleware,  createHouseCleaningService);
router.post("/verify",  verifyCleaningPayment);

module.exports = router;
