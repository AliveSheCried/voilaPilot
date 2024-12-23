import logger from "../config/logger.js";
import { ValidationError } from "../utils/errors.js";

/**
 * Global error handling middleware
 */
const errorHandler = (err, req, res, next) => {
  // Log error details
  logger.error("Error occurred:", {
    error: {
      name: err.name,
      message: err.message,
      stack: err.stack,
      code: err.code,
      statusCode: err.statusCode,
    },
    request: {
      method: req.method,
      url: req.originalUrl,
      correlationId: req.correlationId,
      userId: req.user?.id,
    },
  });

  // Set default error values
  err.statusCode = err.statusCode || 500;
  err.message = err.message || "Internal server error";

  // Handle specific error types
  if (err.name === "ValidationError") {
    err = new ValidationError(err.message, err.errors);
  }

  // Send error response
  res.status(err.statusCode).json({
    success: false,
    error: err.code || "INTERNAL_ERROR",
    message: err.message,
    ...(process.env.NODE_ENV === "development" && {
      stack: err.stack,
      details: err.details,
    }),
  });
};

export default errorHandler;
