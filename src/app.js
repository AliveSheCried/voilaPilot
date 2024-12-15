const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const authRoutes = require("./routes/authRoutes");
const trueLayerRoutes = require("./routes/trueLayerRoutes");
const errorHandler = require("./middleware/errorHandler");
const { validateApiVersion } = require("./middleware/trueLayerValidation");
const config = require("./config/config");

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

// Routes
app.use("/api/v1/auth", authRoutes);
app.use("/api/v1/truelayer", trueLayerRoutes);

// Error handling
app.use(errorHandler);

module.exports = app;
