const rateLimit = require("express-rate-limit");
const logger = require("../config/logger");

// Rate limit configurations based on user role and endpoint
const rateLimitConfig = {
  default: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100,
  },
  admin: {
    windowMs: 15 * 60 * 1000,
    max: 1000, // Higher limit for admins
  },
  endpoints: {
    "/api/v1/console/metrics": {
      windowMs: 5 * 60 * 1000, // 5 minutes
      max: 50,
      skipFailedRequests: true, // Don't count failed requests
    },
    "/api/v1/console/keys": {
      windowMs: 15 * 60 * 1000,
      max: 200,
      skipSuccessfulRequests: false,
    },
  },
};

// Helper to mask sensitive data in logs
const maskSensitiveData = (data) => {
  if (!data) return data;

  // Mask IP addresses
  if (
    typeof data === "string" &&
    /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(data)
  ) {
    return data.replace(/\.\d+\.\d+$/, ".xxx.xxx");
  }

  return data;
};

// Create rate limiter middleware factory
const createRateLimiter = (endpoint) => {
  return rateLimit({
    windowMs:
      rateLimitConfig.endpoints[endpoint]?.windowMs ||
      rateLimitConfig.default.windowMs,
    max: (req) => {
      // Get configuration based on user role and endpoint
      const userRole = req.user?.role || "user";
      const endpointConfig = rateLimitConfig.endpoints[endpoint];
      const roleConfig = rateLimitConfig[userRole];

      // Use the most permissive limit that applies
      return Math.max(
        endpointConfig?.max || 0,
        roleConfig?.max || 0,
        rateLimitConfig.default.max
      );
    },
    message: {
      success: false,
      error: "RATE_LIMIT_EXCEEDED",
      message: "Too many requests, please try again later",
    },
    handler: (req, res, next, options) => {
      logger.warn("Rate limit exceeded for console operations", {
        ip: maskSensitiveData(req.ip),
        userId: req.user?.id,
        role: req.user?.role,
        endpoint: req.originalUrl,
        userAgent: req.headers["user-agent"],
        remainingRequests: res.getHeader("X-RateLimit-Remaining"),
      });
      res.status(429).json(options.message);
    },
    keyGenerator: (req) => {
      // Use combination of IP and user ID for rate limiting
      return `${req.ip}-${req.user?.id || "anonymous"}-${req.user?.role || "user"}`;
    },
    skip: (req) => {
      // Skip rate limiting for health checks and admin metrics
      if (req.path === "/health") return true;
      if (req.user?.role === "admin" && req.path === "/metrics") return true;
      return false;
    },
    standardHeaders: true,
    legacyHeaders: false,
    // Store in-memory for development, use Redis for production
    store: process.env.NODE_ENV === "production" ? undefined : undefined, // TODO: Add Redis store
  });
};

// Middleware to apply rate limiting based on endpoint
const consoleLimiter = (req, res, next) => {
  const endpoint = req.path;
  const limiter = createRateLimiter(endpoint);
  return limiter(req, res, next);
};

module.exports = {
  consoleLimiter,
  rateLimitConfig, // Export for testing
};
