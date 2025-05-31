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
  handlePaystackWebhook,
} = require("../controller/bookingCtrl");

// 🚨 WEBHOOK ROUTES MUST BE FIRST! 🚨
route.get("/webhooks/paystack", (req, res) => {
  console.log("🔍 GET webhook hit");
  res.status(200).json({
    message: "Webhook endpoint verified",
    status: "active",
  });
});

route.post("/webhooks/paystack", handlePaystackWebhook);
route.get("/webhook-test", (req, res) => {
  res.json({ message: "Test route working!" });
});

// NON-PARAMETERIZED ROUTES NEXT
route.post("/create-service", authMiddleware, createCleaningService);
route.post("/paystack", authMiddleware, paystackPayment);
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
