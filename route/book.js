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
  console.log("🔍 GET request - webhook verification");
  console.log("Query params:", req.query);

  const { trxref, reference } = req.query;

  if (reference || trxref) {
    // Return HTML page with button to redirect
    const successPage = `
      <!DOCTYPE html>
      <html lang="en">
      <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Payment Successful - Klinner</title>
          <style>
              body {
                  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                  margin: 0;
                  padding: 20px;
                  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                  min-height: 100vh;
                  display: flex;
                  align-items: center;
                  justify-content: center;
              }
              .container {
                  background: white;
                  padding: 40px;
                  border-radius: 15px;
                  box-shadow: 0 10px 25px rgba(0,0,0,0.2);
                  text-align: center;
                  max-width: 500px;
                  width: 100%;
              }
              .checkmark {
                  width: 60px;
                  height: 60px;
                  border-radius: 50%;
                  background: #4CAF50;
                  display: flex;
                  align-items: center;
                  justify-content: center;
                  margin: 0 auto 20px;
                  animation: checkmark 0.5s ease-in-out;
              }
              @keyframes checkmark {
                  0% { transform: scale(0); }
                  100% { transform: scale(1); }
              }
              .checkmark svg {
                  width: 30px;
                  height: 30px;
                  fill: white;
              }
              h1 {
                  color: #333;
                  margin-bottom: 10px;
                  font-size: 24px;
              }
              .reference {
                  background: #f8f9fa;
                  padding: 15px;
                  border-radius: 8px;
                  font-family: monospace;
                  color: #333;
                  margin: 20px 0;
                  border-left: 4px solid #4CAF50;
                  word-break: break-all;
              }
              .confirm-button {
                  background: #6366f1;
                  color: white;
                  border: none;
                  padding: 15px 30px;
                  border-radius: 10px;
                  font-size: 16px;
                  font-weight: 600;
                  cursor: pointer;
                  transition: all 0.3s ease;
                  box-shadow: 0 4px 10px rgba(99, 102, 241, 0.3);
                  margin-top: 20px;
              }
              .confirm-button:hover {
                  background: #5856eb;
                  transform: translateY(-2px);
                  box-shadow: 0 6px 15px rgba(99, 102, 241, 0.4);
              }
              .confirm-button:active {
                  transform: translateY(0);
              }
              .subtitle {
                  color: #666;
                  margin-bottom: 20px;
                  font-size: 16px;
              }
          </style>
      </head>
      <body>
          <div class="container">
              <div class="checkmark">
                  <svg viewBox="0 0 24 24">
                      <path d="M9,20.42L2.79,14.21L5.62,11.38L9,14.77L18.88,4.88L21.71,7.71L9,20.42Z"/>
                  </svg>
              </div>
              <h1>Payment Successful! 🎉</h1>
              <p class="subtitle">Your payment has been processed successfully.</p>
              <div class="reference">
                  <strong>Transaction Reference:</strong><br>
                  ${reference || trxref}
              </div>
              <button class="confirm-button" onclick="goToConfirmation()">
                  View Booking Confirmation
              </button>
          </div>
          
          <script>
              function goToConfirmation() {
                  window.location.href = 'https://kliner-web-app.vercel.app/booking-confirmation?reference=${reference || trxref}';
              }
          </script>
      </body>
      </html>
    `;

    return res.send(successPage);
  }
});

  // Fallback redirect for verification requests without reference
  res.redirect("https://kliner-web-app.vercel.app");
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
