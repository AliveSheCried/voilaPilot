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

// TrueLayer Integration Errors
class TrueLayerError extends AppError {
  constructor(message, statusCode, errorCode, details = {}) {
    super(message, statusCode, `TRUELAYER_${errorCode}`);
    this.source = "TrueLayer";
    this.details = details;
  }

  static authenticationFailed(
    message = "TrueLayer authentication failed",
    details = {}
  ) {
    return new TrueLayerError(message, 401, "AUTH_FAILED", details);
  }

  static tokenExchangeFailed(message = "Token exchange failed", details = {}) {
    return new TrueLayerError(message, 400, "TOKEN_EXCHANGE_FAILED", details);
  }

  static dataRetrievalFailed(
    message = "Failed to retrieve data",
    details = {}
  ) {
    return new TrueLayerError(message, 500, "DATA_RETRIEVAL_FAILED", details);
  }

  static rateLimit(message = "Rate limit exceeded", details = {}) {
    return new TrueLayerError(message, 429, "RATE_LIMIT", details);
  }

  static connectionFailed(
    message = "Connection to TrueLayer failed",
    details = {}
  ) {
    return new TrueLayerError(message, 503, "CONNECTION_FAILED", details);
  }
}

// Validation Errors
class ValidationError extends AppError {
  constructor(message, details = []) {
    super(message, 400, "VALIDATION_ERROR");
    this.details = details;
  }
}

// Authorization Errors
class AuthorizationError extends AppError {
  constructor(message = "Insufficient permissions", subType = "GENERAL") {
    super(message, 403, `AUTHORIZATION_${subType}`);
    this.subType = subType;
  }

  static roleRequired(role, message = `Role ${role} required`) {
    return new AuthorizationError(message, "ROLE_REQUIRED");
  }

  static resourceForbidden(message = "Access to resource forbidden") {
    return new AuthorizationError(message, "RESOURCE_FORBIDDEN");
  }
}

// Resource Errors
class ResourceNotFoundError extends AppError {
  constructor(resource = "Resource", details = {}) {
    super(`${resource} not found`, 404, "NOT_FOUND_ERROR");
    this.resource = resource;
    this.details = details;
  }
}

// Rate Limiting
class RateLimitError extends AppError {
  constructor(message = "Rate limit exceeded", details = {}) {
    super(message, 429, "RATE_LIMIT_ERROR");
    this.details = details;
  }
}

// Database Errors
class DatabaseError extends AppError {
  constructor(message = "Database operation failed", operation, details = {}) {
    super(message, 500, `DATABASE_${operation}`);
    this.operation = operation;
    this.details = details;
  }

  static connectionFailed(details = {}) {
    return new DatabaseError(
      "Database connection failed",
      "CONNECTION_FAILED",
      details
    );
  }

  static queryFailed(details = {}) {
    return new DatabaseError("Database query failed", "QUERY_FAILED", details);
  }

  static validationFailed(details = {}) {
    return new DatabaseError(
      "Database validation failed",
      "VALIDATION_FAILED",
      details
    );
  }
}

// Global error handler middleware
const globalErrorHandler = (err, req, res, next) => {
  const logger = require("../config/logger");

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

module.exports = {
  AppError,
  AuthenticationError,
  RegistrationError,
  TrueLayerError,
  ValidationError,
  AuthorizationError,
  ResourceNotFoundError,
  RateLimitError,
  DatabaseError,
  globalErrorHandler,
};
