const MonitoringService = require("../services/monitoringService");
const logger = require("../config/logger");

/**
 * Middleware to track API request metrics
 */
const trackApiMetrics = async (req, res, next) => {
  // Record start time
  const startTime = process.hrtime();

  // Store original end function
  const originalEnd = res.end;

  // Override end function to capture response time
  res.end = function (...args) {
    // Calculate response time
    const diff = process.hrtime(startTime);
    const responseTime = (diff[0] * 1e3 + diff[1] * 1e-6).toFixed(2);

    // Track metrics asynchronously
    MonitoringService.trackApiRequest(req, res, responseTime).catch((err) => {
      logger.error("Failed to track API metrics", {
        error: err.message,
        path: req.path,
      });
    });

    // Call original end function
    originalEnd.apply(res, args);
  };

  next();
};

/**
 * Middleware to track error metrics
 */
const trackErrorMetrics = async (err, req, res, next) => {
  // Track error metrics asynchronously
  MonitoringService.trackError(err, req).catch((trackingError) => {
    logger.error("Failed to track error metrics", {
      error: trackingError.message,
      originalError: err.message,
    });
  });

  next(err);
};

module.exports = {
  trackApiMetrics,
  trackErrorMetrics,
};
