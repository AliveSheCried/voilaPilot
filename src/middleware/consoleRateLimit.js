import rateLimit from "express-rate-limit";
import Redis from "ioredis";
import RedisStore from "rate-limit-redis";
import logger from "../config/logger.js";
import { createSafeLoggingContext } from "../utils/masking.js";

// Redis client for rate limiting
const redisClient = new Redis(
  process.env.REDIS_URL || "redis://localhost:6379"
);

// Base rate limit configurations
const baseLimits = {
  standard: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // Limit each IP to 100 requests per windowMs
  },
  burst: {
    windowMs: 60 * 1000, // 1 minute
    max: 30, // Limit each IP to 30 requests per minute
  },
};

// Dynamic multipliers based on user roles
const roleMultipliers = {
  admin: 4,
  developer: 2,
  user: 1,
};

// Endpoint-specific configurations
const endpointConfigs = {
  "/api/v1/console/keys": {
    windowMs: 5 * 60 * 1000, // 5 minutes
    max: 50, // Stricter limit for key management
  },
};

/**
 * Get dynamic rate limit based on user role and traffic patterns
 * @param {Object} req - Express request object
 * @returns {Object} Rate limit configuration
 */
const getDynamicRateLimit = async (req) => {
  const endpoint = req.path;
  const userRole = req.user?.role || "user";
  const multiplier = roleMultipliers[userRole] || 1;

  // Use endpoint-specific config if available
  const baseConfig = endpointConfigs[endpoint] || baseLimits.standard;

  try {
    // Check recent traffic patterns
    const recentRequests = await redisClient.get(`traffic:${endpoint}`);
    const isHighTraffic = recentRequests > baseConfig.max * 0.8;

    // Adjust limits based on traffic
    const adjustedMax = isHighTraffic
      ? Math.floor(baseConfig.max * 0.8) // Reduce limit during high traffic
      : Math.floor(baseConfig.max * multiplier);

    return {
      windowMs: baseConfig.windowMs,
      max: adjustedMax,
    };
  } catch (error) {
    logger.error("Failed to get dynamic rate limit", {
      error: error.message,
      endpoint,
      userRole,
    });
    return baseConfig;
  }
};

/**
 * Create rate limiter middleware
 * @param {Object} options - Rate limit options
 * @returns {Function} Rate limit middleware
 */
const createRateLimiter = (options = {}) => {
  return rateLimit({
    store: new RedisStore({
      client: redisClient,
      prefix: "rl:",
    }),
    windowMs: options.windowMs || baseLimits.standard.windowMs,
    max: options.max || baseLimits.standard.max,
    handler: (req, res) => {
      const context = createSafeLoggingContext({
        ip: req.ip,
        userId: req.user?.id,
        endpoint: req.path,
        userAgent: req.headers["user-agent"],
      });

      logger.warn("Rate limit exceeded", context);

      res.status(429).json({
        error: "Too many requests",
        retryAfter: Math.ceil(options.windowMs / 1000),
      });
    },
    keyGenerator: (req) => {
      // Use combination of IP and user ID if available
      return req.user?.id ? `${req.ip}:${req.user.id}` : req.ip;
    },
    skip: (req) => {
      // Skip rate limiting for health checks
      return req.path === "/health";
    },
    onLimitReached: (req, res, options) => {
      // Track rate limit violations
      const context = createSafeLoggingContext({
        ip: req.ip,
        userId: req.user?.id,
        endpoint: req.path,
        userAgent: req.headers["user-agent"],
      });

      logger.warn("Rate limit reached", {
        ...context,
        limit: options.max,
        windowMs: options.windowMs,
      });
    },
  });
};

/**
 * Dynamic rate limiting middleware
 */
const dynamicRateLimit = async (req, res, next) => {
  try {
    const config = await getDynamicRateLimit(req);
    const limiter = createRateLimiter(config);
    await limiter(req, res, next);
  } catch (error) {
    logger.error("Rate limiting error", {
      error: error.message,
      path: req.path,
    });
    // Fall back to default rate limit on error
    const defaultLimiter = createRateLimiter();
    await defaultLimiter(req, res, next);
  }
};

export {
  baseLimits,
  dynamicRateLimit,
  endpointConfigs,
  getDynamicRateLimit,
  roleMultipliers,
};
