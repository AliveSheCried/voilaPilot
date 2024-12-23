import logger from "../config/logger.js";

/**
 * Track API metrics middleware
 */
const trackApiMetrics = (req, res, next) => {
  const start = Date.now();

  // Store original end function
  const originalEnd = res.end;

  // Override end function
  res.end = function (...args) {
    const duration = Date.now() - start;
    const size = res.get("Content-Length");

    // Log metrics
    logger.info("API Metrics", {
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      duration: `${duration}ms`,
      size: size ? `${size}b` : "unknown",
      correlationId: req.correlationId,
      userId: req.user?.id,
    });

    // Call original end
    originalEnd.apply(res, args);
  };

  next();
};

/**
 * Track error metrics middleware
 */
const trackErrorMetrics = (err, req, res, next) => {
  logger.error("Error Metrics", {
    error: {
      name: err.name,
      message: err.message,
      code: err.code,
      statusCode: err.statusCode,
    },
    request: {
      method: req.method,
      path: req.path,
      correlationId: req.correlationId,
      userId: req.user?.id,
    },
  });

  next(err);
};

export { trackApiMetrics, trackErrorMetrics };
