class AppError extends Error {
  constructor(message, statusCode, errorCode) {
    super(message);
    this.statusCode = statusCode;
    this.errorCode = errorCode;
    this.status = `${statusCode}`.startsWith("4") ? "fail" : "error";
    this.isOperational = true;

    Error.captureStackTrace(this, this.constructor);
  }
}

class ValidationError extends AppError {
  constructor(message, details = []) {
    super(message, 400, "VALIDATION_ERROR");
    this.details = details;
  }
}

class AuthenticationError extends AppError {
  constructor(message = "Authentication required") {
    super(message, 401, "AUTHENTICATION_ERROR");
  }
}

class AuthorizationError extends AppError {
  constructor(message = "Insufficient permissions") {
    super(message, 403, "AUTHORIZATION_ERROR");
  }
}

class ResourceNotFoundError extends AppError {
  constructor(resource = "Resource") {
    super(`${resource} not found`, 404, "NOT_FOUND_ERROR");
  }
}

class RateLimitError extends AppError {
  constructor(message = "Rate limit exceeded") {
    super(message, 429, "RATE_LIMIT_ERROR");
  }
}

class ApiKeyError extends AppError {
  constructor(message, errorCode = "API_KEY_ERROR") {
    super(message, 400, errorCode);
  }
}

class ApiKeyNotFoundError extends AppError {
  constructor(message = "API key not found") {
    super(message, 404, "API_KEY_NOT_FOUND");
  }
}

class ApiKeyLimitError extends AppError {
  constructor(message = "API key limit reached") {
    super(message, 400, "API_KEY_LIMIT_REACHED");
  }
}

class ApiKeyInactiveError extends AppError {
  constructor(message = "API key is inactive") {
    super(message, 400, "KEY_ALREADY_INACTIVE");
  }
}

class ApiKeyExpiredError extends AppError {
  constructor(message = "API key is expired") {
    super(message, 400, "KEY_EXPIRED");
  }
}

class ApiKeyInvalidError extends AppError {
  constructor(message = "Invalid API key") {
    super(message, 400, "INVALID_API_KEY");
  }
}

class ApiKeyStateError extends AppError {
  constructor(message, state) {
    super(message, 400, `KEY_${state.toUpperCase()}`);
    this.state = state;
  }
}

// Global error handler middleware
const globalErrorHandler = (err, req, res, next) => {
  const logger = require("../config/logger");

  // Log error with correlation ID
  logger.error("Unhandled error:", {
    error: {
      message: err.message,
      stack: err.stack,
      code: err.errorCode,
      statusCode: err.statusCode,
    },
    request: {
      method: req.method,
      url: req.originalUrl,
      userId: req.user?.id,
      correlationId: req.correlationId,
    },
  });

  // Set default error values
  err.statusCode = err.statusCode || 500;
  err.errorCode = err.errorCode || "INTERNAL_ERROR";
  err.message = err.isOperational ? err.message : "Internal server error";

  // Handle specific error types
  if (err.name === "ValidationError") {
    err = new ValidationError("Validation failed", err.details);
  }

  if (err.name === "MongoError" && err.code === 11000) {
    err = new AppError("Duplicate field value", 400, "DUPLICATE_ERROR");
  }

  // Track error frequency for monitoring
  const errorMetrics = {
    errorCode: err.errorCode,
    statusCode: err.statusCode,
    path: req.path,
    timestamp: new Date(),
  };

  // Could be stored in Redis/MongoDB for analysis
  logger.debug("Error metrics:", errorMetrics);

  // Send error response
  res.status(err.statusCode).json({
    success: false,
    error: err.errorCode,
    message: err.message,
    ...(err.details && { details: err.details }),
    ...(process.env.NODE_ENV === "development" && { stack: err.stack }),
    correlationId: req.correlationId,
  });
};

module.exports = {
  AppError,
  ValidationError,
  AuthenticationError,
  AuthorizationError,
  ResourceNotFoundError,
  RateLimitError,
  ApiKeyError,
  ApiKeyNotFoundError,
  ApiKeyLimitError,
  ApiKeyInactiveError,
  ApiKeyExpiredError,
  ApiKeyInvalidError,
  ApiKeyStateError,
  globalErrorHandler,
};
