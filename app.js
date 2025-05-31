require("dotenv").config();
const express = require("express");
const morgan = require("morgan");
const dbConnect = require("./config/dbConnect");
const authRoute = require("./route/auth");
const userRoute = require("./route/user");
const serviceRoute = require("./route/book");
const cors = require("cors");
const { notFound, errorHandler } = require("./middleware/errorHandler");

const app = express();
const port = process.env.PORT || 3002;

// Connect to database
dbConnect();

// Enhanced CORS configuration
const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (mobile apps, server-to-server)
    if (!origin) return callback(null, true);

    const allowedOrigins = [
      "https://www.klinner.net.ng",
      "https://kliner-web-app.vercel.app", // ← This should be allowed
      "http://localhost:3000",
      "http://localhost:3001",
      "http://127.0.0.1:3000",
      "http://127.0.0.1:3001",
      "https://localhost:3000",
      "https://pagead2.googlesyndication.com",
    ];

    console.log(`🔍 CORS check for origin: ${origin}`); // Add this for debugging

    if (allowedOrigins.includes(origin)) {
      console.log(`✅ CORS allowed for: ${origin}`);
      callback(null, true);
    } else {
      console.log(`❌ CORS blocked for: ${origin}`);
      // For development, you might want to allow it anyway:
      callback(null, true); // ← Temporarily allow all origins for testing
      // callback(new Error("Not allowed by CORS")); // ← Use this in production
    }
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
  allowedHeaders: [
    "Origin",
    "X-Requested-With",
    "Content-Type",
    "Accept",
    "Authorization",
    "Cache-Control",
    "Pragma",
    "Expires",
    "Last-Modified",
    "ETag",
  ],
  exposedHeaders: ["Content-Length", "Content-Type", "Cache-Control"],
  preflightContinue: false,
  optionsSuccessStatus: 200,
};

// Apply CORS middleware
app.use(cors(corsOptions));


// Body parsing middleware
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: false, limit: "10mb" }));

// Logging middleware
app.use(morgan("combined"));

// Health check endpoint
app.get("/health", (req, res) => {
  res.status(200).json({
    success: true,
    message: "Server is healthy",
    timestamp: new Date().toISOString(),
    port: port,
  });
});

// API Routes
app.use("/api/v1/auth", authRoute);
app.use("/api/v1/user", userRoute);
app.use("/api/v1/service", serviceRoute);

// Root endpoint
app.get("/", (req, res) => {
  res.status(200).json({
    success: true,
    message: "Klinners API Server",
    version: "1.0.0",
    endpoints: ["/api/v1/auth", "/api/v1/user", "/api/v1/service", "/health"],
  });
});

// Error handling middleware (must be last)
app.use(notFound);
app.use(errorHandler);

// Graceful shutdown handling
process.on("SIGTERM", () => {
  console.log("SIGTERM received. Shutting down gracefully...");
  process.exit(0);
});

process.on("SIGINT", () => {
  console.log("SIGINT received. Shutting down gracefully...");
  process.exit(0);
});

// Start the server
app.listen(port, "0.0.0.0", () => {
  console.log(`🚀 Server is running on port ${port}`);
  console.log(`📍 Health check: http://localhost:${port}/health`);
  console.log(`🌐 API Base URL: http://localhost:${port}/api/v1`);
  console.log(`🔧 Environment: ${process.env.NODE_ENV || "development"}`);
});
