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
  reportOwnerIssue,
  createHouseCleaningService,
  verifyCleaningPayment,
  paystackWebhook,
} = require("../controller/services");

const { authMiddleware } = require("../middleware/authMiddleware");
const rateLimit = require("../middleware/rateLimit");
const { uploadFieldReportImages } = require("../utils/uploadFieldImages");

// Universal service creation - handles all service types (house_cleaning, laundry, move_out, repairs)
router.post("/create", authMiddleware, createService);

// Universal payment verification - handles all service types
// One payment shouldn't be checked more than 20 times in 10 minutes. Unknown references are
// refused from our own records before Paystack is ever called.
const verifyLimit = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 20,
  key: (req) => (typeof req.body?.reference === "string" ? req.body.reference : null),
  message: "We've checked this payment a lot already. Please wait a few minutes and try again.",
});
router.post("/verify-payment", verifyLimit, verifyPayment);

// Paystack calls this by itself when a payment succeeds (public: it is authenticated by signature)
router.post("/paystack-webhook", paystackWebhook);

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

router.post(
  "/:id/owner-issue",
  authMiddleware,
  (req, res, next) => {
    uploadFieldReportImages(req, res, (err) => {
      if (err) return res.status(400).json({ success: false, message: err.message || "Invalid upload." });
      next();
    });
  },
  reportOwnerIssue
);

// GET /api/v1/services/:id - Get single service by ID
router.get('/:id', authMiddleware, getServiceById);

module.exports = router;
