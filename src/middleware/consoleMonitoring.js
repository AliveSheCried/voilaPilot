import mongoose from "mongoose";
import logger from "../config/logger.js";
import { createSafeLoggingContext } from "../utils/masking.js";

// Metrics schema
const metricsSchema = new mongoose.Schema({
  timestamp: {
    type: Date,
    default: Date.now,
    expires: 30 * 24 * 60 * 60, // Auto-delete after 30 days
  },
  userId: String,
  endpoint: String,
  method: String,
  statusCode: Number,
  responseTime: Number,
  success: Boolean,
  errorCode: String,
  userAgent: String,
  ip: String,
});

const Metrics = mongoose.model("Metrics", metricsSchema);

// In-memory metrics buffer for batch processing
const metricsBuffer = [];
const BUFFER_SIZE = 100;
const FLUSH_INTERVAL = 60000; // 1 minute

// Start buffer flush interval
setInterval(async () => {
  if (metricsBuffer.length > 0) {
    await flushMetricsBuffer();
  }
}, FLUSH_INTERVAL);

/**
 * Flush metrics buffer to database
 * @private
 */
const flushMetricsBuffer = async () => {
  try {
    const metrics = [...metricsBuffer];
    metricsBuffer.length = 0; // Clear buffer

    await Metrics.insertMany(metrics);

    logger.debug("Flushed metrics buffer", {
      count: metrics.length,
      oldestTimestamp: metrics[0].timestamp,
      newestTimestamp: metrics[metrics.length - 1].timestamp,
    });
  } catch (error) {
    logger.error("Failed to flush metrics buffer", {
      error: error.message,
      metricsCount: metricsBuffer.length,
    });
  }
};

/**
 * Add metric to buffer
 * @private
 */
const bufferMetric = async (metric) => {
  metricsBuffer.push(metric);

  if (metricsBuffer.length >= BUFFER_SIZE) {
    await flushMetricsBuffer();
  }
};

/**
 * Get aggregated metrics
 * @param {Object} options - Query options
 * @returns {Promise<Object>} Aggregated metrics
 */
const getMetrics = async ({ startDate, endDate, userId } = {}) => {
  // Ensure buffer is flushed before querying
  if (metricsBuffer.length > 0) {
    await flushMetricsBuffer();
  }

  const query = {};
  if (startDate) query.timestamp = { $gte: new Date(startDate) };
  if (endDate)
    query.timestamp = { ...query.timestamp, $lte: new Date(endDate) };
  if (userId) query.userId = userId;

  const [aggregation] = await Metrics.aggregate([
    { $match: query },
    {
      $group: {
        _id: null,
        requestCount: { $sum: 1 },
        successCount: {
          $sum: { $cond: [{ $eq: ["$success", true] }, 1, 0] },
        },
        errorCount: {
          $sum: { $cond: [{ $eq: ["$success", false] }, 1, 0] },
        },
        totalResponseTime: { $sum: "$responseTime" },
        maxResponseTime: { $max: "$responseTime" },
        minResponseTime: { $min: "$responseTime" },
        uniqueUsers: { $addToSet: "$userId" },
        endpoints: { $addToSet: "$endpoint" },
      },
    },
    {
      $project: {
        _id: 0,
        requestCount: 1,
        successRate: {
          $multiply: [{ $divide: ["$successCount", "$requestCount"] }, 100],
        },
        errorRate: {
          $multiply: [{ $divide: ["$errorCount", "$requestCount"] }, 100],
        },
        averageResponseTime: {
          $divide: ["$totalResponseTime", "$requestCount"],
        },
        maxResponseTime: 1,
        minResponseTime: 1,
        uniqueUserCount: { $size: "$uniqueUsers" },
        endpointCount: { $size: "$endpoints" },
      },
    },
  ]);

  return (
    aggregation || {
      requestCount: 0,
      successRate: 0,
      errorRate: 0,
      averageResponseTime: 0,
      maxResponseTime: 0,
      minResponseTime: 0,
      uniqueUserCount: 0,
      endpointCount: 0,
    }
  );
};

/**
 * Monitoring middleware
 */
const monitorConsoleActivity = async (req, res, next) => {
  const startTime = Date.now();

  // Capture response data
  const originalSend = res.send;
  res.send = function (body) {
    const responseTime = Date.now() - startTime;
    const success = res.statusCode < 400;

    // Create metric
    const metric = {
      timestamp: new Date(),
      userId: req.user?.id,
      endpoint: req.path,
      method: req.method,
      statusCode: res.statusCode,
      responseTime,
      success,
      errorCode: !success ? body?.error : undefined,
      userAgent: req.headers["user-agent"],
      ip: req.ip,
    };

    // Buffer metric
    bufferMetric(metric).catch((error) => {
      logger.error("Failed to buffer metric", {
        error: error.message,
        metric: createSafeLoggingContext(metric),
      });
    });

    // Log slow requests
    if (responseTime > 1000) {
      logger.warn(
        "Slow request detected",
        createSafeLoggingContext({
          ...metric,
          body: undefined, // Don't log response body
        })
      );
    }

    originalSend.apply(res, arguments);
  };

  next();
};

export { getMetrics, monitorConsoleActivity };
