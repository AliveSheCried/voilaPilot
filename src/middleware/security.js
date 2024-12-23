import cors from "cors";
import express from "express";
import helmet from "helmet";
import hpp from "hpp";
import xss from "xss-clean";
import logger from "../config/logger.js";
import { RateLimitError, ValidationError } from "../utils/errors.js";

// Security middleware configuration
const securityConfig = {
  cors: {
    origin: process.env.ALLOWED_ORIGINS?.split(",") || "*",
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH"],
    allowedHeaders: ["Content-Type", "Authorization"],
    exposedHeaders: ["X-RateLimit-Reset", "X-RateLimit-Remaining"],
    credentials: true,
  },
  helmet: {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:", "https:"],
      },
    },
    referrerPolicy: { policy: "same-origin" },
  },
  rateLimit: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // Limit each IP to 100 requests per windowMs
    message: "Too many requests from this IP, please try again later",
    handler: (req, res, next) => {
      throw new RateLimitError();
    },
  },
};

// Apply security middleware
const securityMiddleware = [
  // CORS protection
  cors(securityConfig.cors),

  // Set security headers
  helmet(securityConfig.helmet),

  // Sanitize request data
  xss(),

  // Prevent parameter pollution
  hpp(),

  // Parse JSON payloads
  (req, res, next) => {
    express.json({
      limit: "10kb", // Limit body size
      verify: (req, buf) => {
        try {
          JSON.parse(buf);
        } catch (e) {
          throw new ValidationError("Invalid JSON payload");
        }
      },
    })(req, res, next);
  },

  // Add correlation ID
  (req, res, next) => {
    req.correlationId =
      req.headers["x-correlation-id"] ||
      `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    res.setHeader("X-Correlation-ID", req.correlationId);
    next();
  },

  // Add API version header
  (req, res, next) => {
    res.setHeader("X-API-Version", process.env.API_VERSION || "1.0.0");
    next();
  },

  // Log request
  (req, res, next) => {
    logger.info("Incoming request", {
      method: req.method,
      url: req.originalUrl,
      correlationId: req.correlationId,
      ip: req.ip,
      userAgent: req.headers["user-agent"],
    });
    next();
  },

  // Add response time header
  (req, res, next) => {
    const start = Date.now();
    res.on("finish", () => {
      const duration = Date.now() - start;
      res.setHeader("X-Response-Time", `${duration}ms`);

      if (duration > 1000) {
        // Log slow requests
        logger.warn("Slow request detected", {
          method: req.method,
          url: req.originalUrl,
          duration: `${duration}ms`,
          correlationId: req.correlationId,
        });
      }
    });
    next();
  },
];

export { securityConfig, securityMiddleware };
