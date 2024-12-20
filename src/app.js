const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const authRoutes = require("./routes/authRoutes");
const trueLayerRoutes = require("./routes/trueLayerRoutes");
const errorHandler = require("./middleware/errorHandler");
const { validateApiVersion } = require("./middleware/trueLayerValidation");
const config = require("./config/config");
const { securityMiddleware } = require("./middleware/security");
const { globalErrorHandler } = require("./utils/errors");
const consoleRoutes = require("./routes/consoleRoutes");

const app = express();

// Security middleware
app.use(helmet());
app.use(cors(config.cors));

// Request parsing
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Logging
if (process.env.NODE_ENV !== "test") {
  app.use(morgan("dev"));
}

// API version validation for all routes
app.use("/api", validateApiVersion);

// Apply security middleware
app.use(securityMiddleware);

// Routes
app.use("/api/v1/auth", authRoutes);
app.use("/api/v1/truelayer", trueLayerRoutes);
app.use("/api/v1/console", consoleRoutes);

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
  });
});

module.exports = app;
