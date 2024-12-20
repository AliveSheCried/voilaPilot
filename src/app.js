const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const passport = require("passport");
const { v4: uuidv4 } = require("uuid");
const logger = require("./config/logger");
const { globalErrorHandler } = require("./utils/errors");
const { trackApiMetrics, trackErrorMetrics } = require("./middleware/metrics");
const authRoutes = require("./routes/authRoutes");
const trueLayerRoutes = require("./routes/trueLayerRoutes");
const errorHandler = require("./middleware/errorHandler");
const { validateApiVersion } = require("./middleware/trueLayerValidation");
const config = require("./config/config");
const { securityMiddleware } = require("./middleware/security");
const consoleRoutes = require("./routes/consoleRoutes");

const app = express();

// Security middleware
app.use(helmet());
app.use(cors(config.cors));

// Request parsing
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Initialize Passport
require("./config/passport");
app.use(passport.initialize());

// Add correlation ID to each request
app.use((req, res, next) => {
  req.correlationId = uuidv4();
  res.setHeader("X-Correlation-ID", req.correlationId);
  next();
});

// Request logging
app.use((req, res, next) => {
  logger.info("Incoming request", {
    method: req.method,
    path: req.path,
    correlationId: req.correlationId,
    ip: req.ip,
    userAgent: req.headers["user-agent"],
  });
  next();
});

// API Metrics tracking
app.use(trackApiMetrics);

// API version validation for all routes
app.use("/api", validateApiVersion);

// Apply security middleware
app.use(securityMiddleware);

// Routes
app.use("/api/v1/auth", authRoutes);
app.use("/api/v1/truelayer", trueLayerRoutes);
app.use("/api/v1/console", consoleRoutes);

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({
    status: "healthy",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

// Error tracking
app.use(trackErrorMetrics);

// Error handling
app.use(errorHandler);

// Global error handler
app.use(globalErrorHandler);

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: "NOT_FOUND",
    message: "Resource not found",
    path: req.path,
  });
});

module.exports = app;
