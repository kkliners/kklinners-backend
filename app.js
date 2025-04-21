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
const port = process.env.PORT || 9000;

dbConnect();

// Configure CORS with specific options
app.use(
  cors({
    origin: "http://localhost:3000", // Your frontend URL (not wildcard *)
    credentials: true, // Allow credentials
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"], // Allowed methods
    allowedHeaders: ["Content-Type", "Authorization"], // Allowed headers
  })
);

// Other middleware
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(morgan("tiny"));

// Routes
app.use("/api/v1/auth", authRoute);
app.use("/api/v1/user", userRoute);
app.use("/api/v1/service", serviceRoute);

// Error handling middleware
app.use(notFound);
app.use(errorHandler);

// Start the server
app.listen(port, "0.0.0.0", () => {
  console.log(`Server is running on port ${port}`);
});
