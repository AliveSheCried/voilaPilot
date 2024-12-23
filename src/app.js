import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import helmet from "helmet";
import passport from "passport";
import path from "path";
import { fileURLToPath } from "url";
import { v4 as uuidv4 } from "uuid";
import config from "./config/config.js";
import connectDB from "./config/database.js";
import logger from "./config/logger.js";
import errorHandler from "./middleware/errorHandler.js";
import { trackApiMetrics, trackErrorMetrics } from "./middleware/metrics.js";
import { securityMiddleware } from "./middleware/security.js";
import { validateApiVersion } from "./middleware/trueLayerValidation.js";
import authRoutes from "./routes/authRoutes.js";
import consoleRoutes from "./routes/consoleRoutes.js";
import trueLayerRoutes from "./routes/trueLayerRoutes.js";
import { globalErrorHandler } from "./utils/errors.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log("Starting server initialization...");

// Load environment variables with explicit path
dotenv.config({ path: path.join(__dirname, "../.env") });

console.log("Environment variables loaded");

// Debug log environment variables only in development
if (process.env.NODE_ENV === "development") {
  console.log("Development environment detected");
  logger.debug("Environment variables loaded:", {
    NODE_ENV: process.env.NODE_ENV,
    PORT: process.env.PORT,
    MONGODB_URI: process.env.MONGODB_URI ? "Defined" : "Undefined",
  });
}

const app = express();

// Security middleware
app.use(helmet());
app.use(cors(config.cors));

// Request parsing
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Initialize Passport
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

// Start the server
const startServer = async () => {
  try {
    // Connect to MongoDB
    console.log("Connecting to MongoDB...");
    await connectDB();
    console.log("MongoDB connection initiated");

    const PORT = process.env.PORT || 5000;
    const server = app.listen(PORT, () => {
      console.log(
        `Server running in ${process.env.NODE_ENV} mode on port ${PORT}`
      );
      logger.info(
        `Server running in ${process.env.NODE_ENV} mode on port ${PORT}`
      );
    });

    // Handle unhandled promise rejections
    process.on("unhandledRejection", (err) => {
      console.error("UNHANDLED REJECTION! Details:", {
        message: err.message,
        stack: err.stack,
        error: err,
      });
      logger.error("UNHANDLED REJECTION! 💥 Shutting down...", {
        error: err.message,
        stack: err.stack,
      });
      server.close(() => {
        process.exit(1);
      });
    });
  } catch (error) {
    console.error("Error during server startup:", error);
    process.exit(1);
  }
};

startServer();

export default app;
