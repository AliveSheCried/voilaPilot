const express = require("express");
const dotenv = require("dotenv");
const morgan = require("morgan");
const passport = require("passport");
const helmet = require("helmet");
const cors = require("cors");
const path = require("path");
const logger = require("./config/logger");
const connectDB = require("./config/database");
const authRoutes = require("./routes/authRoutes");
const consoleRoutes = require("./routes/consoleRoutes");

// Load environment variables with explicit path
dotenv.config({ path: path.join(__dirname, "../.env") });

// Debug log environment variables only in development
if (process.env.NODE_ENV === "development") {
  logger.debug("Environment variables loaded:", {
    NODE_ENV: process.env.NODE_ENV,
    PORT: process.env.PORT,
    MONGODB_URI: process.env.MONGODB_URI ? "Defined" : "Undefined",
  });
}

// Initialize express app
const app = express();

// Security middleware
app.use(helmet());
app.use(cors());

// Body parser middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// HTTP request logging
const morganFormat =
  process.env.NODE_ENV === "development" ? "dev" : "combined";
app.use(morgan(morganFormat, { stream: logger.stream }));

// Initialize Passport
app.use(passport.initialize());

// Connect to MongoDB
connectDB();

// Routes
app.use("/api/v1/auth", authRoutes);
app.use("/api/v1/console", consoleRoutes);

// Basic health check route
app.get("/api/v1/health", (req, res) => {
  res.status(200).json({
    status: "success",
    message: "Server is running",
    environment: process.env.NODE_ENV,
  });
});

// Global error handler
app.use((err, req, res, next) => {
  logger.error("Unhandled error:", { error: err.message, stack: err.stack });
  res.status(500).json({
    status: "error",
    message:
      process.env.NODE_ENV === "development"
        ? err.message
        : "Something went wrong!",
  });
});

// Handle unmatched routes
app.use("*", (req, res) => {
  logger.warn(`Attempted access to non-existent route: ${req.originalUrl}`);
  res.status(404).json({
    status: "error",
    message: "Route not found",
  });
});

const PORT = process.env.PORT || 5000;

const server = app.listen(PORT, () => {
  logger.info(`Server running in ${process.env.NODE_ENV} mode on port ${PORT}`);
});

// Handle unhandled promise rejections
process.on("unhandledRejection", (err) => {
  logger.error("UNHANDLED REJECTION! 💥 Shutting down...", {
    error: err.message,
    stack: err.stack,
  });
  server.close(() => {
    process.exit(1);
  });
});

module.exports = app;
