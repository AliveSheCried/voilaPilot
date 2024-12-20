/**
 * Error codes and messages for the API
 */
const ERROR_CODES = {
  // Authentication errors
  AUTHENTICATION_ERROR: "AUTHENTICATION_ERROR",
  AUTHORIZATION_ERROR: "AUTHORIZATION_ERROR",
  TOKEN_EXPIRED: "TOKEN_EXPIRED",
  INVALID_TOKEN: "INVALID_TOKEN",

  // Validation errors
  VALIDATION_ERROR: "VALIDATION_ERROR",
  INVALID_REQUEST: "INVALID_REQUEST",
  INVALID_CREDENTIALS: "INVALID_CREDENTIALS",

  // Resource errors
  NOT_FOUND: "NOT_FOUND",
  DUPLICATE_ERROR: "DUPLICATE_ERROR",
  RESOURCE_CONFLICT: "RESOURCE_CONFLICT",

  // API Key errors
  KEY_LIMIT_REACHED: "KEY_LIMIT_REACHED",
  KEY_CREATION_FAILED: "KEY_CREATION_FAILED",
  KEY_RETRIEVAL_FAILED: "KEY_RETRIEVAL_FAILED",
  KEY_DEACTIVATION_FAILED: "KEY_DEACTIVATION_FAILED",
  INVALID_KEY_FORMAT: "INVALID_KEY_FORMAT",
  KEY_EXPIRED: "KEY_EXPIRED",
  KEY_INACTIVE: "KEY_INACTIVE",

  // Rate limiting errors
  RATE_LIMIT_EXCEEDED: "RATE_LIMIT_EXCEEDED",

  // Server errors
  INTERNAL_ERROR: "INTERNAL_ERROR",
  DATABASE_ERROR: "DATABASE_ERROR",
  CACHE_ERROR: "CACHE_ERROR",
};

/**
 * Error messages for the API
 */
const ERROR_MESSAGES = {
  // Authentication errors
  [ERROR_CODES.AUTHENTICATION_ERROR]: "Authentication required",
  [ERROR_CODES.AUTHORIZATION_ERROR]: "Insufficient permissions",
  [ERROR_CODES.TOKEN_EXPIRED]: "Token has expired",
  [ERROR_CODES.INVALID_TOKEN]: "Invalid token provided",

  // Validation errors
  [ERROR_CODES.VALIDATION_ERROR]: "Validation failed",
  [ERROR_CODES.INVALID_REQUEST]: "Invalid request data",
  [ERROR_CODES.INVALID_CREDENTIALS]: "Invalid credentials provided",

  // Resource errors
  [ERROR_CODES.NOT_FOUND]: "Resource not found",
  [ERROR_CODES.DUPLICATE_ERROR]: "Resource already exists",
  [ERROR_CODES.RESOURCE_CONFLICT]: "Resource conflict",

  // API Key errors
  [ERROR_CODES.KEY_LIMIT_REACHED]: "Maximum number of API keys reached",
  [ERROR_CODES.KEY_CREATION_FAILED]: "Failed to create API key",
  [ERROR_CODES.KEY_RETRIEVAL_FAILED]: "Failed to retrieve API keys",
  [ERROR_CODES.KEY_DEACTIVATION_FAILED]: "Failed to deactivate API key",
  [ERROR_CODES.INVALID_KEY_FORMAT]: "Invalid API key format",
  [ERROR_CODES.KEY_EXPIRED]: "API key has expired",
  [ERROR_CODES.KEY_INACTIVE]: "API key is inactive",

  // Rate limiting errors
  [ERROR_CODES.RATE_LIMIT_EXCEEDED]:
    "Too many requests, please try again later",

  // Server errors
  [ERROR_CODES.INTERNAL_ERROR]: "Internal server error",
  [ERROR_CODES.DATABASE_ERROR]: "Database operation failed",
  [ERROR_CODES.CACHE_ERROR]: "Cache operation failed",
};

/**
 * HTTP status codes for error types
 */
const ERROR_STATUS_CODES = {
  // Authentication errors
  [ERROR_CODES.AUTHENTICATION_ERROR]: 401,
  [ERROR_CODES.AUTHORIZATION_ERROR]: 403,
  [ERROR_CODES.TOKEN_EXPIRED]: 401,
  [ERROR_CODES.INVALID_TOKEN]: 401,

  // Validation errors
  [ERROR_CODES.VALIDATION_ERROR]: 400,
  [ERROR_CODES.INVALID_REQUEST]: 400,
  [ERROR_CODES.INVALID_CREDENTIALS]: 401,

  // Resource errors
  [ERROR_CODES.NOT_FOUND]: 404,
  [ERROR_CODES.DUPLICATE_ERROR]: 409,
  [ERROR_CODES.RESOURCE_CONFLICT]: 409,

  // API Key errors
  [ERROR_CODES.KEY_LIMIT_REACHED]: 400,
  [ERROR_CODES.KEY_CREATION_FAILED]: 500,
  [ERROR_CODES.KEY_RETRIEVAL_FAILED]: 500,
  [ERROR_CODES.KEY_DEACTIVATION_FAILED]: 500,
  [ERROR_CODES.INVALID_KEY_FORMAT]: 400,
  [ERROR_CODES.KEY_EXPIRED]: 401,
  [ERROR_CODES.KEY_INACTIVE]: 401,

  // Rate limiting errors
  [ERROR_CODES.RATE_LIMIT_EXCEEDED]: 429,

  // Server errors
  [ERROR_CODES.INTERNAL_ERROR]: 500,
  [ERROR_CODES.DATABASE_ERROR]: 500,
  [ERROR_CODES.CACHE_ERROR]: 500,
};

module.exports = {
  ERROR_CODES,
  ERROR_MESSAGES,
  ERROR_STATUS_CODES,
};
