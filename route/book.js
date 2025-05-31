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

  const successPage = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Payment Processed - Klinner</title>
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
            p {
                color: #666;
                line-height: 1.6;
                margin-bottom: 20px;
            }
            .reference {
                background: #f8f9fa;
                padding: 15px;
                border-radius: 8px;
                font-family: monospace;
                color: #333;
                margin: 20px 0;
                border-left: 4px solid #4CAF50;
            }
            .footer {
                margin-top: 30px;
                font-size: 14px;
                color: #888;
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
            <h1>Payment Processed Successfully</h1>
            <p>Your payment has been received and is being processed. You can close this window.</p>
            ${
              reference
                ? `
                <div class="reference">
                    <strong>Transaction Reference:</strong><br>
                    ${reference}
                </div>
            `
                : ""
            }
            <p class="footer">
                This window can be safely closed.<br>
                You will receive an email confirmation shortly.
            </p>
        </div>
    </body>
    </html>
  `;

  res.send(successPage);
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
