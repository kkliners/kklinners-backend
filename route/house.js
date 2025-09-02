// routes/services.js
const express = require("express");
const router = express.Router();

const {
  createService,
  verifyPayment,
  getUserServices,
  getAllServices,
  getServiceById,
  getServiceStats,
  createHouseCleaningService,
  verifyCleaningPayment,
} = require("../controller/services");

const { authMiddleware } = require("../middleware/authMiddleware");

// Universal service creation - handles all service types (house_cleaning, laundry, move_out, repairs)
router.post("/create", authMiddleware, createService);

// Universal payment verification - handles all service types
router.post("/verify-payment", authMiddleware, verifyPayment);

// Legacy house cleaning routes for backward compatibility
router.post(
  "/house-cleaning/create",
  authMiddleware,
  createHouseCleaningService
);
router.post(
  "/house-cleaning/verify-payment",
  authMiddleware,
  verifyCleaningPayment
);


// GET /api/v1/services/my-services - Get user's services
router.get('/my-services', authMiddleware, getUserServices);

// GET /api/v1/services/all - Get all services (Admin only)
router.get('/all', authMiddleware, getAllServices);

// GET /api/v1/services/stats - Get service statistics (Admin only)
router.get('/stats', authMiddleware, getServiceStats);

// GET /api/v1/services/:id - Get single service by ID
router.get('/:id', authMiddleware, getServiceById);

module.exports = router;
