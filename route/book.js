// routes/bookingRoutes.js
const express = require("express");
const route = express.Router();
const { authMiddleware, isAdmin } = require("../middleware/authMiddleware");
const {
  createCleaningService,
  verifyPayment,
  getSingleService,
  paystackPayment,
  cancelService,
  userCancelledServices,
  getAllCompletedServices,
  getAllUpcomingServices,
  getAllPendingServices,
  getUserCompletedServices,
  getUserUpcomingServices,
  getUserPendingServices,
  markTaskCompleted,
  handlePaystackWebhook, // Add webhook handler
} = require("../controller/bookingCtrl");

// ===== PAYMENT ROUTES =====
// Create a new cleaning service (UPDATED ENDPOINT NAME)
route.post("/create", authMiddleware, createCleaningService); // Changed from '/create-service'

// Process payment via Paystack
route.post("/paystack", authMiddleware, paystackPayment);

// Verify payment
route.post("/verify-payment", authMiddleware, verifyPayment); // Added auth middleware

// Webhook endpoint (NO AUTH - Paystack will call this)
route.post("/webhooks/paystack", handlePaystackWebhook);

// ===== SERVICE MANAGEMENT ROUTES =====
// Get details of a specific service for a user
route.get("/:user_id/services/:service_id", authMiddleware, getSingleService);

// Cancel a specific service
route.put("/:service_id/cancel", authMiddleware, cancelService); // Changed to PUT and better path

// Get all services canceled by a specific user
route.get(
  "/:user_id/cancelled-services",
  authMiddleware,
  userCancelledServices
);

// ===== ADMIN ROUTES =====
// Get all pending services (Admin only)
route.get("/services/pending", authMiddleware, isAdmin, getAllPendingServices); // Fixed middleware order

// Get all upcoming services (Admin only)
route.get(
  "/services/upcoming",
  authMiddleware,
  isAdmin,
  getAllUpcomingServices
); // Fixed middleware order

// Get all completed services (Admin only)
route.get(
  "/services/completed",
  authMiddleware,
  isAdmin,
  getAllCompletedServices
);

// ===== USER-SPECIFIC SERVICE ROUTES =====
// Get all pending services for a specific user
route.get("/:user_id/services/pending", authMiddleware, getUserPendingServices);

// Get all upcoming services for a specific user
route.get(
  "/:user_id/services/upcoming",
  authMiddleware,
  getUserUpcomingServices
);

// Get all completed services for a specific user
route.get(
  "/:user_id/services/completed",
  authMiddleware,
  getUserCompletedServices
);

// ===== SERVICE STATUS ROUTES =====
// Mark a task as completed
route.put("/:service_id/complete", authMiddleware, markTaskCompleted); // Fixed parameter name

module.exports = route;

// ===== PAYMENT ROUTES ONLY (Alternative structure) =====
// If you want to separate payment routes, create a separate file:

// routes/paymentRoutes.js
const express = require("express");
const paymentRoute = express.Router();
const { authMiddleware } = require("../middleware/authMiddleware");
const {
  createCleaningService,
  verifyPayment,
  paystackPayment,
  handlePaystackWebhook,
} = require("../controller/bookingCtrl");

// Payment initialization routes
paymentRoute.post("/initialize", authMiddleware, createCleaningService);
paymentRoute.post("/paystack", authMiddleware, paystackPayment);

// Payment verification
paymentRoute.post("/verify", authMiddleware, verifyPayment);

// Webhook (no auth required)
paymentRoute.post("/webhooks/paystack", handlePaystackWebhook);

// Export for use in app.js
// app.use('/api/v1/payments', paymentRoute);

module.exports = { route, paymentRoute };
