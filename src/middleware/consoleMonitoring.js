const logger = require("../config/logger");
const mongoose = require("mongoose");

// Define schema for metrics storage
const MetricSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  endpoint: { type: String, required: true },
  method: { type: String, required: true },
  count: { type: Number, default: 0 },
  lastAccess: { type: Date, default: Date.now },
  responseTime: { type: Number, default: 0 }, // Average response time
  totalResponses: { type: Number, default: 0 }, // Total number of responses
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

// Add indexes for frequent queries
MetricSchema.index({ userId: 1, endpoint: 1, method: 1 });
MetricSchema.index({ lastAccess: 1 }, { expireAfterSeconds: 86400 }); // Auto-delete after 24 hours

const Metric = mongoose.model("Metric", MetricSchema);

// Dynamic thresholds based on endpoint and user role
const thresholds = {
  default: {
    requestLimit: 50,
    responseTimeWarning: 1000, // ms
  },
  admin: {
    requestLimit: 200,
    responseTimeWarning: 2000, // ms
  },
  endpoints: {
    "/api/v1/console/keys": {
      requestLimit: 100,
      responseTimeWarning: 500, // ms
    },
    // Add more endpoint-specific thresholds as needed
  },
};

// Helper to mask sensitive data
const maskSensitiveData = (data) => {
  if (!data) return data;

  // Mask IP addresses
  if (
    typeof data === "string" &&
    /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(data)
  ) {
    return data.replace(/\.\d+\.\d+$/, ".xxx.xxx");
  }

  // Mask email addresses
  if (typeof data === "string" && data.includes("@")) {
    const [local, domain] = data.split("@");
    return `${local.charAt(0)}***@${domain}`;
  }

  return data;
};

const monitorConsoleActivity = async (req, res, next) => {
  const startTime = process.hrtime();
  const userId = req.user?.id;
  const userRole = req.user?.role || "user";
  const endpoint = req.originalUrl;

  // Get appropriate thresholds
  const endpointThresholds =
    thresholds.endpoints[endpoint] ||
    thresholds[userRole] ||
    thresholds.default;

  try {
    // Update or create metric
    const metric = await Metric.findOneAndUpdate(
      {
        userId,
        endpoint,
        method: req.method,
      },
      {
        $inc: { count: 1 },
        $set: { lastAccess: new Date() },
      },
      {
        upsert: true,
        new: true,
      }
    );

    // Check for suspicious activity
    if (metric.count > endpointThresholds.requestLimit) {
      logger.warn("Suspicious console activity detected", {
        userId,
        ip: maskSensitiveData(req.ip),
        endpoint,
        requestCount: metric.count,
        method: req.method,
        userAgent: maskSensitiveData(req.headers["user-agent"]),
      });
    }

    // Monitor response time and update metrics
    const oldJson = res.json;
    res.json = async function (data) {
      const duration = process.hrtime(startTime);
      const durationMs = duration[0] * 1000 + duration[1] / 1e6;

      // Update response time metrics
      await Metric.findByIdAndUpdate(metric._id, {
        $inc: { totalResponses: 1 },
        $set: {
          responseTime:
            (metric.responseTime * metric.totalResponses + durationMs) /
            (metric.totalResponses + 1),
          updatedAt: new Date(),
        },
      });

      // Log slow responses
      if (durationMs > endpointThresholds.responseTimeWarning) {
        logger.warn("Slow console operation detected", {
          userId,
          ip: maskSensitiveData(req.ip),
          endpoint,
          duration: `${durationMs.toFixed(2)}ms`,
          threshold: `${endpointThresholds.responseTimeWarning}ms`,
        });
      }

      // Log operation completion
      logger.info("Console operation completed", {
        userId,
        ip: maskSensitiveData(req.ip),
        method: req.method,
        path: endpoint,
        duration: `${durationMs.toFixed(2)}ms`,
        status: res.statusCode,
      });

      return oldJson.call(this, data);
    };

    next();
  } catch (error) {
    logger.error("Failed to update metrics", {
      userId,
      ip: maskSensitiveData(req.ip),
      endpoint,
      error: error.message,
    });
    next();
  }
};

// Get metrics with aggregation
const getMetrics = async (options = {}) => {
  const { userId, startDate, endDate } = options;

  const match = {
    ...(userId && { userId: mongoose.Types.ObjectId(userId) }),
    ...(startDate &&
      endDate && {
        updatedAt: {
          $gte: new Date(startDate),
          $lte: new Date(endDate),
        },
      }),
  };

  const metrics = await Metric.aggregate([
    { $match: match },
    {
      $group: {
        _id: {
          endpoint: "$endpoint",
          method: "$method",
        },
        totalRequests: { $sum: "$count" },
        avgResponseTime: { $avg: "$responseTime" },
        uniqueUsers: { $addToSet: "$userId" },
      },
    },
    {
      $project: {
        endpoint: "$_id.endpoint",
        method: "$_id.method",
        totalRequests: 1,
        avgResponseTime: { $round: ["$avgResponseTime", 2] },
        uniqueUsers: { $size: "$uniqueUsers" },
      },
    },
  ]);

  return {
    metrics,
    summary: {
      totalEndpoints: metrics.length,
      totalRequests: metrics.reduce((sum, m) => sum + m.totalRequests, 0),
      avgResponseTime:
        metrics.reduce((sum, m) => sum + m.avgResponseTime, 0) / metrics.length,
    },
  };
};

module.exports = {
  monitorConsoleActivity,
  getMetrics,
  Metric, // Export for testing
};
