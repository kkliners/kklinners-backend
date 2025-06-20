const express = require("express");
const route = express.Router();
const { authMiddleware, isAdmin } = require("../middleware/authMiddleware");
const {
  createCleaningService,
  verifyPayment,
  getSingleService,
  
  cancelService,
  userCancelledServices,
  getAllCompletedServices,
  getAllUpcomingServices,
  getAllPendingServices,
  getUserCompletedServices,
  getUserUpcomingServices,
  getUserPendingServices,
  markTaskCompleted,
  handlePaystackWebhook,
} = require("../controller/bookingCtrl");

// 🚨 WEBHOOK ROUTES MUST BE FIRST! 🚨
route.get("/webhooks/paystack", (req, res) => {
  console.log("🔍 GET request - webhook verification");
  console.log("Query params:", req.query);

  const { trxref, reference } = req.query;

  if (reference) {
    // Redirect to your frontend with the transaction reference
    const redirectUrl = `https://kliner-web-app.vercel.app/booking/bookings`;
    return res.redirect(redirectUrl);
  }

  // Fallback redirect
  res.redirect("https://kliner-web-app.vercel.app");
});

route.post("/webhooks/paystack", handlePaystackWebhook);
route.get("/webhook-test", (req, res) => {
  res.json({ message: "Test route working!" });
});

// NON-PARAMETERIZED ROUTES NEXT
route.post("/create-service", authMiddleware, createCleaningService);

route.post("/verify-payment", verifyPayment);
route.get("/services/pending", isAdmin, authMiddleware, getAllPendingServices);
route.get("/services/upcoming", isAdmin, getAllUpcomingServices);

// 🚨 PARAMETERIZED ROUTES LAST! 🚨
route.get("/:user_id/services/:service_id", authMiddleware, getSingleService);
route.get(
  "/:user_id/cancelled-services",
  authMiddleware,
  userCancelledServices
);
route.get("/:user_id/services/pending", authMiddleware, getUserPendingServices);
route.get(
  "/:user_id/services/upcoming",
  authMiddleware,
  getUserUpcomingServices
);
route.get(
  "/:user_id/services/completed",
  authMiddleware,
  getUserCompletedServices
);
route.put("/:Service_id/complete", authMiddleware, markTaskCompleted);

// This is the problematic route - MUST be last
route.post("/:service_id", authMiddleware, cancelService);

module.exports = route;
