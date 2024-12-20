const mongoose = require("mongoose");
const logger = require("../config/logger");

// Schema for error metrics
const ErrorMetricSchema = new mongoose.Schema({
  errorCode: String,
  statusCode: Number,
  path: String,
  source: String,
  subType: String,
  userId: String,
  timestamp: { type: Date, default: Date.now },
  details: mongoose.Schema.Types.Mixed,
});

const ErrorMetric = mongoose.model("ErrorMetric", ErrorMetricSchema);

// Schema for API metrics
const ApiMetricSchema = new mongoose.Schema({
  path: String,
  method: String,
  statusCode: Number,
  responseTime: Number,
  userId: String,
  timestamp: { type: Date, default: Date.now },
  source: {
    type: String,
    enum: ["api", "trueLayer", "internal"],
    default: "api",
  },
});

const ApiMetric = mongoose.model("ApiMetric", ApiMetricSchema);

class MonitoringService {
  /**
   * Track error occurrence
   * @param {Object} error - Error object
   * @param {Object} request - Request context
   */
  static async trackError(error, request) {
    try {
      const metric = new ErrorMetric({
        errorCode: error.errorCode,
        statusCode: error.statusCode,
        path: request.path,
        source: error.source,
        subType: error.subType,
        userId: request.user?.id,
        details: {
          message: error.message,
          stack: error.stack,
          ...error.details,
        },
      });

      await metric.save();

      logger.debug("Error metric tracked", {
        errorCode: error.errorCode,
        path: request.path,
      });
    } catch (err) {
      logger.error("Failed to track error metric", {
        error: err.message,
        originalError: error.errorCode,
      });
    }
  }

  /**
   * Track API request
   * @param {Object} request - Request object
   * @param {Object} response - Response object
   * @param {number} responseTime - Response time in milliseconds
   */
  static async trackApiRequest(request, response, responseTime) {
    try {
      const metric = new ApiMetric({
        path: request.path,
        method: request.method,
        statusCode: response.statusCode,
        responseTime,
        userId: request.user?.id,
        source: request.source || "api",
      });

      await metric.save();

      logger.debug("API metric tracked", {
        path: request.path,
        responseTime,
      });
    } catch (err) {
      logger.error("Failed to track API metric", {
        error: err.message,
        path: request.path,
      });
    }
  }

  /**
   * Get error metrics for a time period
   * @param {Date} startDate - Start date
   * @param {Date} endDate - End date
   * @param {Object} filters - Additional filters
   */
  static async getErrorMetrics(startDate, endDate, filters = {}) {
    const query = {
      timestamp: {
        $gte: startDate,
        $lte: endDate,
      },
      ...filters,
    };

    const metrics = await ErrorMetric.aggregate([
      { $match: query },
      {
        $group: {
          _id: {
            errorCode: "$errorCode",
            source: "$source",
          },
          count: { $sum: 1 },
          avgStatusCode: { $avg: "$statusCode" },
          paths: { $addToSet: "$path" },
        },
      },
      {
        $project: {
          _id: 0,
          errorCode: "$_id.errorCode",
          source: "$_id.source",
          count: 1,
          avgStatusCode: 1,
          uniquePaths: { $size: "$paths" },
        },
      },
    ]);

    return metrics;
  }

  /**
   * Get API metrics for a time period
   * @param {Date} startDate - Start date
   * @param {Date} endDate - End date
   * @param {Object} filters - Additional filters
   */
  static async getApiMetrics(startDate, endDate, filters = {}) {
    const query = {
      timestamp: {
        $gte: startDate,
        $lte: endDate,
      },
      ...filters,
    };

    const metrics = await ApiMetric.aggregate([
      { $match: query },
      {
        $group: {
          _id: {
            path: "$path",
            method: "$method",
            source: "$source",
          },
          count: { $sum: 1 },
          avgResponseTime: { $avg: "$responseTime" },
          successRate: {
            $avg: {
              $cond: [{ $lt: ["$statusCode", 400] }, 1, 0],
            },
          },
        },
      },
      {
        $project: {
          _id: 0,
          path: "$_id.path",
          method: "$_id.method",
          source: "$_id.source",
          count: 1,
          avgResponseTime: 1,
          successRate: 1,
        },
      },
    ]);

    return metrics;
  }

  /**
   * Get real-time metrics for monitoring dashboard
   */
  static async getRealTimeMetrics() {
    const lastHour = new Date(Date.now() - 60 * 60 * 1000);

    const [errors, requests] = await Promise.all([
      ErrorMetric.countDocuments({ timestamp: { $gte: lastHour } }),
      ApiMetric.aggregate([
        {
          $match: {
            timestamp: { $gte: lastHour },
          },
        },
        {
          $group: {
            _id: null,
            totalRequests: { $sum: 1 },
            avgResponseTime: { $avg: "$responseTime" },
            successRate: {
              $avg: {
                $cond: [{ $lt: ["$statusCode", 400] }, 1, 0],
              },
            },
          },
        },
      ]),
    ]);

    return {
      lastHour: {
        errorCount: errors,
        requestCount: requests[0]?.totalRequests || 0,
        avgResponseTime: requests[0]?.avgResponseTime || 0,
        successRate: requests[0]?.successRate || 1,
      },
    };
  }
}

module.exports = MonitoringService;
