import express from "express";
import logger from "../config/logger.js";
import {
  createKey,
  deleteKey,
  getApiKeys,
} from "../controllers/consoleController.js";
import { authenticateJWT } from "../middleware/auth.js";
import { monitorConsoleActivity } from "../middleware/consoleMonitoring.js";
import { dynamicRateLimit } from "../middleware/consoleRateLimit.js";
import { get as cacheGet, set as cacheSet } from "../services/cacheService.js";
import { AuthorizationError } from "../utils/errors.js";
import {
  validateCreateKey,
  validateKeyId,
} from "../validations/consoleValidation.js";

const router = express.Router();

/**
 * Role-based access control middleware
 * @param {string[]} roles - Allowed roles
 */
const checkRole = (roles) => (req, res, next) => {
  if (!req.user) {
    return next(new AuthorizationError("Authentication required"));
  }

  if (!roles.includes(req.user.role)) {
    return next(new AuthorizationError("Insufficient permissions"));
  }

  next();
};

/**
 * Cache middleware for API responses
 * @param {number} duration - Cache duration in seconds
 */
const cacheResponse = (duration) => (req, res, next) => {
  // Skip caching for non-GET requests
  if (req.method !== "GET") {
    return next();
  }

  const key = `api-keys-${req.user.id}`;

  // Skip cache if requested
  if (req.query.bypass_cache) {
    logger.debug("Cache bypass requested", {
      userId: req.user.id,
      path: req.path,
    });
    return next();
  }

  // Try to get from cache
  const cachedResponse = cacheGet(key);
  if (cachedResponse) {
    logger.debug("Serving cached response", {
      userId: req.user.id,
      cacheKey: key,
    });
    return res.json(cachedResponse);
  }

  // Store the original json method
  const originalJson = res.json;
  res.json = function (data) {
    // Only cache successful responses
    if (res.statusCode === 200 && data.success) {
      cacheSet(key, data, duration);
      logger.debug("Caching response", {
        userId: req.user.id,
        cacheKey: key,
        duration: `${duration}s`,
      });
    }
    return originalJson.call(this, data);
  };

  next();
};

// Apply authentication to all routes
router.use(authenticateJWT);

// Get all API keys
router.get(
  "/keys",
  dynamicRateLimit,
  cacheResponse(300), // Cache for 5 minutes
  getApiKeys
);

// Create new API key
router.post(
  "/keys",
  dynamicRateLimit,
  validateCreateKey,
  monitorConsoleActivity,
  createKey
);

// Delete API key
router.delete(
  "/keys/:id",
  dynamicRateLimit,
  validateKeyId,
  monitorConsoleActivity,
  deleteKey
);

export default router;
