const express = require("express");
const { authenticateJWT } = require("../middleware/auth");
const { dynamicRateLimit } = require("../middleware/consoleRateLimit");
const { monitorConsoleActivity } = require("../middleware/consoleMonitoring");
const {
  validateCreateKey,
  validateKeyId,
} = require("../validations/consoleValidation");
const {
  getApiKeys,
  createKey,
  deleteKey,
} = require("../controllers/consoleController");
const cache = require("../services/cacheService");
const logger = require("../config/logger");
const { AuthorizationError } = require("../utils/errors");

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
  const cachedResponse = cache.get(key);
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
      cache.set(key, data, duration);
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

/**
 * Cache invalidation middleware
 */
const invalidateCache = () => (req, res, next) => {
  const key = `api-keys-${req.user.id}`;

  // Store the original json method
  const originalJson = res.json;
  res.json = function (data) {
    // Invalidate cache on successful mutations
    if (res.statusCode === 200 || res.statusCode === 201) {
      cache.del(key);
      logger.debug("Cache invalidated", {
        userId: req.user.id,
        cacheKey: key,
      });
    }
    return originalJson.call(this, data);
  };

  next();
};

// Apply common middleware to all routes
router.use(authenticateJWT);
router.use(dynamicRateLimit);
router.use(monitorConsoleActivity);

// API Key management routes
router.get(
  "/keys",
  checkRole(["user", "admin"]),
  cacheResponse(60),
  getApiKeys
);

router.post(
  "/keys",
  checkRole(["user", "admin"]),
  validateCreateKey,
  invalidateCache(),
  createKey
);

router.delete(
  "/keys/:keyId",
  checkRole(["user", "admin"]),
  validateKeyId,
  invalidateCache(),
  deleteKey
);

// Metrics endpoint (admin only)
router.get("/metrics", checkRole(["admin"]), async (req, res, next) => {
  try {
    const { getMetrics } = require("../middleware/consoleMonitoring");
    const { startDate, endDate, userId } = req.query;

    // Get metrics data
    const metricsData = await getMetrics({
      userId,
      startDate,
      endDate,
    });

    // Include cache statistics
    const cacheStats = cache.getMetrics();

    res.json({
      success: true,
      data: {
        ...metricsData,
        cache: cacheStats,
      },
    });
  } catch (error) {
    next(error);
  }
});

// Cache management endpoint (admin only)
router.post("/cache/clear", checkRole(["admin"]), async (req, res, next) => {
  try {
    const { userId, namespace } = req.query;

    if (userId) {
      // Clear specific user's cache
      await cache.del("api-keys", userId);
      logger.info("Cleared user cache", { userId });
    } else if (namespace) {
      // Clear namespace
      await cache.clearNamespace(namespace);
      logger.info("Cleared cache namespace", { namespace });
    } else {
      // Clear matching keys from cache
      await cache.clearNamespace("api-keys");
      logger.info("Cleared API keys cache");
    }

    res.json({
      success: true,
      message: "Cache cleared successfully",
    });
  } catch (error) {
    next(error);
  }
});

// Health check endpoint (no auth required)
router.get("/health", (req, res) => {
  const metrics = cache.getMetrics();

  res.json({
    success: true,
    data: {
      status: "healthy",
      timestamp: new Date().toISOString(),
      cache: {
        status: metrics.hits > 0 ? "operational" : "idle",
        hitRate: metrics.hitRate.toFixed(2) + "%",
        errors: metrics.errors,
      },
    },
  });
});

module.exports = router;
