import logger from "../config/logger.js";

class AppError extends Error {
  constructor(message, statusCode, errorCode) {
    super(message);
    this.statusCode = statusCode;
    this.errorCode = errorCode;
    this.status = `${statusCode}`.startsWith("4") ? "fail" : "error";
    this.isOperational = true;
    this.timestamp = new Date().toISOString();

    Error.captureStackTrace(this, this.constructor);
  }
}

// API Key Errors
class ApiKeyError extends AppError {
  constructor(message = "API key error", errorCode = "API_KEY_ERROR") {
    super(message, 400, errorCode);
  }
}

class ApiKeyNotFoundError extends AppError {
  constructor(message = "API key not found") {
    super(message, 404, "API_KEY_NOT_FOUND");
  }
}

// Authentication Errors
class AuthenticationError extends AppError {
  constructor(message = "Authentication failed", subType = "GENERAL") {
    super(message, 401, `AUTH_${subType}`);
    this.subType = subType;
  }

  static credentialsInvalid(message = "Invalid credentials") {
    return new AuthenticationError(message, "INVALID_CREDENTIALS");
  }

  static tokenExpired(message = "Token has expired") {
    return new AuthenticationError(message, "TOKEN_EXPIRED");
  }

  static tokenInvalid(message = "Invalid token") {
    return new AuthenticationError(message, "TOKEN_INVALID");
  }

  static tokenBlacklisted(message = "Token has been blacklisted") {
    return new AuthenticationError(message, "TOKEN_BLACKLISTED");
  }
}

class RegistrationError extends AppError {
  constructor(message, subType = "GENERAL") {
    super(message, 400, `REGISTRATION_${subType}`);
    this.subType = subType;
  }

  static emailInUse(message = "Email already registered") {
    return new RegistrationError(message, "EMAIL_IN_USE");
  }

  static passwordWeak(message = "Password does not meet requirements") {
    return new RegistrationError(message, "WEAK_PASSWORD");
  }

  static invalidData(message = "Invalid registration data") {
    return new RegistrationError(message, "INVALID_DATA");
  }
}

class TrueLayerError extends AppError {
  constructor(message, subType = "GENERAL") {
    super(message, 500, `TRUELAYER_${subType}`);
    this.subType = subType;
  }

  static connectionFailed(message = "Failed to connect to TrueLayer") {
    return new TrueLayerError(message, "CONNECTION_FAILED");
  }

  static authenticationFailed(message = "TrueLayer authentication failed") {
    return new TrueLayerError(message, "AUTH_FAILED");
  }

  static resourceNotFound(message = "TrueLayer resource not found") {
    return new TrueLayerError(message, "NOT_FOUND");
  }
}

class ValidationError extends AppError {
  constructor(message = "Validation failed", details = []) {
    super(message, 400, "VALIDATION_ERROR");
    this.details = details;
  }
}

class AuthorizationError extends AppError {
  constructor(message = "Authorization failed", subType = "GENERAL") {
    super(message, 403, `AUTHORIZATION_${subType}`);
    this.subType = subType;
  }

  static roleRequired(role, message = "Insufficient permissions") {
    return new AuthorizationError(message, "ROLE_REQUIRED");
  }
}

class ResourceNotFoundError extends AppError {
  constructor(resource, message = "Resource not found") {
    super(message, 404, "NOT_FOUND");
    this.resource = resource;
  }
}

class RateLimitError extends AppError {
  constructor(message = "Too many requests", retryAfter = 60) {
    super(message, 429, "RATE_LIMIT_ERROR");
    this.retryAfter = retryAfter;
  }
}

class DatabaseError extends AppError {
  constructor(message = "Database error", subType = "GENERAL", details = {}) {
    super(message, 500, `DATABASE_${subType}`);
    this.subType = subType;
    this.details = details;
  }
}

// Global error handler middleware
const globalErrorHandler = (err, req, res, next) => {
  // Log error with correlation ID and request context
  logger.error("Error occurred:", {
    error: {
      message: err.message,
      stack: err.stack,
      code: err.errorCode,
      statusCode: err.statusCode,
      subType: err.subType,
      source: err.source,
      details: err.details,
    },
    request: {
      method: req.method,
      url: req.originalUrl,
      userId: req.user?.id,
      correlationId: req.correlationId,
      userAgent: req.headers["user-agent"],
      ip: req.ip,
    },
    timestamp: new Date().toISOString(),
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
    err = new DatabaseError("Duplicate field value", "DUPLICATE_KEY", {
      field: Object.keys(err.keyPattern)[0],
    });
  }

  // Track error metrics
  const errorMetrics = {
    errorCode: err.errorCode,
    statusCode: err.statusCode,
    path: req.path,
    source: err.source,
    subType: err.subType,
    timestamp: new Date(),
  };

  logger.debug("Error metrics:", errorMetrics);

  // Send error response
  res.status(err.statusCode).json({
    success: false,
    error: err.errorCode,
    message: err.message,
    ...(err.subType && { subType: err.subType }),
    ...(err.details && { details: err.details }),
    ...(process.env.NODE_ENV === "development" && {
      stack: err.stack,
      timestamp: err.timestamp,
    }),
    correlationId: req.correlationId,
  });
};

export {
  ApiKeyError,
  ApiKeyNotFoundError,
  AppError,
  AuthenticationError,
  AuthorizationError,
  DatabaseError,
  RateLimitError,
  RegistrationError,
  ResourceNotFoundError,
  TrueLayerError,
  ValidationError,
  globalErrorHandler,
};
