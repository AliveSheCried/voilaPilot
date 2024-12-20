const express = require("express");
const { authenticateJWT } = require("../middleware/auth");
const { consoleLimiter } = require("../middleware/consoleRateLimit");
const { monitorConsoleActivity } = require("../middleware/consoleMonitoring");
const { getApiKeys } = require("../controllers/consoleController");
const cache = require("../services/cacheService");
const logger = require("../config/logger");

const router = express.Router();

// Role-based access control middleware
const checkRole = (roles) => (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      error: "UNAUTHORIZED",
      message: "Authentication required",
    });
  }

  if (!roles.includes(req.user.role)) {
    return res.status(403).json({
      success: false,
      error: "FORBIDDEN",
      message: "Insufficient permissions",
    });
  }

  next();
};

// Cache middleware for API key responses
const cacheResponse = (duration) => (req, res, next) => {
  const key = `api-keys-${req.user.id}`;
  const cachedResponse = cache.get(key);

  if (cachedResponse && !req.query.bypass_cache) {
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

// Apply middleware to all console routes
router.use(authenticateJWT);
router.use(consoleLimiter);
router.use(monitorConsoleActivity);

// API Key management routes with role-based access
router.get(
  "/keys",
  checkRole(["user", "admin"]),
  cacheResponse(60), // Cache for 1 minute
  getApiKeys
);

// Metrics endpoint (admin only)
router.get("/metrics", checkRole(["admin"]), async (req, res) => {
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
    const cacheStats = cache.getStats();

    res.json({
      success: true,
      data: {
        ...metricsData,
        cache: cacheStats,
      },
    });
  } catch (error) {
    logger.error("Failed to retrieve metrics", {
      userId: req.user.id,
      error: error.message,
    });

    res.status(500).json({
      success: false,
      error: "METRICS_ERROR",
      message: "Failed to retrieve metrics",
    });
  }
});

// Cache management endpoint (admin only)
router.post("/cache/clear", checkRole(["admin"]), (req, res) => {
  try {
    const { userId } = req.query;

    if (userId) {
      // Clear specific user's cache
      const key = `api-keys-${userId}`;
      cache.delete(key);
      logger.info("Cleared user cache", { userId });
    } else {
      // Clear all cache
      cache.clear();
      logger.info("Cleared entire cache");
    }

    res.json({
      success: true,
      message: "Cache cleared successfully",
    });
  } catch (error) {
    logger.error("Failed to clear cache", {
      userId: req.user.id,
      error: error.message,
    });

    res.status(500).json({
      success: false,
      error: "CACHE_ERROR",
      message: "Failed to clear cache",
    });
  }
});

// Health check endpoint (no auth required)
router.get("/health", (req, res) => {
  const cacheStats = cache.getStats();

  res.json({
    success: true,
    data: {
      status: "healthy",
      timestamp: new Date().toISOString(),
      cache: {
        status: cacheStats.valid > 0 ? "operational" : "empty",
        size: cacheStats.size,
      },
    },
  });
});

module.exports = router;
