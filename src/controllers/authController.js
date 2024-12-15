const User = require("../models/User");
const logger = require("../config/logger");
const {
  registerSchema,
  loginSchema,
} = require("../validations/authValidation");
const rateLimit = require("express-rate-limit");
const jwt = require("jsonwebtoken");
const config = require("../config/config");
const { v4: uuidv4 } = require("uuid");
const TokenBlacklist = require("../models/TokenBlacklist");
const TrueLayerService = require("../services/trueLayerService");

// Utility function to mask email
const maskEmail = (email) => {
  const [local, domain] = email.split("@");
  return `${local.charAt(0)}***@${domain}`;
};

// Rate limiter for registration
const registrationLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour window
  max: 5, // limit each IP to 5 registration attempts per hour
  message:
    "Too many registration attempts from this IP, please try again after an hour",
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Register a new user
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
const register = async (req, res, next) => {
  try {
    // Log registration attempt with IP
    logger.info("Registration attempt:", {
      ip: req.ip,
      userAgent: req.headers["user-agent"],
    });

    // Validate request body
    const { error, value } = registerSchema.validate(req.body, {
      abortEarly: false,
      allowUnknown: process.env.NODE_ENV !== "production",
    });

    if (error) {
      logger.warn("Registration validation failed:", {
        ip: req.ip,
        errors: error.details,
      });
      return res.status(400).json({
        status: "error",
        message: "Validation failed",
        errors: error.details.map((detail) => ({
          field: detail.context.key,
          message: detail.message,
        })),
      });
    }

    // Check if user already exists
    const existingUser = await User.findOne({
      $or: [{ email: value.email }, { username: value.username }],
    });

    if (existingUser) {
      logger.warn("Registration failed - user exists:", {
        ip: req.ip,
        email: maskEmail(value.email),
        username: value.username,
      });
      return res.status(409).json({
        status: "error",
        message:
          existingUser.email === value.email
            ? "Email already registered"
            : "Username already taken",
      });
    }

    // Create new user
    const user = new User({
      username: value.username,
      email: value.email,
      password: value.password,
    });

    await user.save();

    logger.info("New user registered:", {
      ip: req.ip,
      userId: user._id,
      email: maskEmail(user.email),
    });

    res.status(201).json({
      status: "success",
      message: "Registration successful",
      data: {
        userId: user._id,
        username: user.username,
        email: maskEmail(user.email),
      },
    });
  } catch (error) {
    logger.error("Registration error:", {
      ip: req.ip,
      error: error.message,
    });
    next(error);
  }
};

// Helper function to generate tokens
const generateTokens = (user) => {
  // Generate JWT ID
  const jti = uuidv4();

  // Generate access token (short-lived)
  const accessToken = jwt.sign(
    {
      id: user._id,
      role: user.role,
      jti,
    },
    config.jwt.secret,
    {
      expiresIn: "15m", // Short lifetime for access token
    }
  );

  // Generate refresh token (long-lived)
  const refreshToken = jwt.sign(
    {
      id: user._id,
      role: user.role,
      jti,
    },
    config.jwt.secret,
    {
      expiresIn: "7d", // Longer lifetime for refresh token
    }
  );

  return { accessToken, refreshToken, jti };
};

const login = async (req, res, next) => {
  try {
    // Log login attempt
    logger.info("Login attempt:", {
      ip: req.ip,
      userAgent: req.headers["user-agent"],
    });

    // Validate request body
    const { error, value } = loginSchema.validate(req.body, {
      abortEarly: false,
      allowUnknown: process.env.NODE_ENV !== "production",
    });

    if (error) {
      logger.warn("Login validation failed:", {
        ip: req.ip,
        errors: error.details,
      });
      return res.status(400).json({
        status: "error",
        message: "Validation failed",
        errors: error.details.map((detail) => ({
          field: detail.context.key,
          message: detail.message,
        })),
      });
    }

    // Find user by email
    const user = await User.findOne({ email: value.email }).select("+password");

    // Check if user exists and password is correct
    if (!user || !(await user.comparePassword(value.password))) {
      logger.warn("Login failed - Invalid credentials:", {
        ip: req.ip,
        email: maskEmail(value.email),
      });
      return res.status(401).json({
        status: "error",
        message: "Invalid email or password",
      });
    }

    // Check if user is active
    if (!user.isActive || user.isDeleted) {
      logger.warn("Login failed - Inactive account:", {
        ip: req.ip,
        userId: user._id,
        email: maskEmail(user.email),
      });
      return res.status(401).json({
        status: "error",
        message: "Account is inactive or has been deleted",
      });
    }

    const { accessToken, refreshToken, jti } = generateTokens(user);

    // Update last login timestamp
    user.lastLogin = new Date();
    await user.save();

    logger.info("Login successful:", {
      ip: req.ip,
      userId: user._id,
      email: maskEmail(user.email),
    });

    // Send response with both tokens
    res.status(200).json({
      status: "success",
      message: "Login successful",
      data: {
        accessToken,
        refreshToken,
        user: {
          id: user._id,
          username: user.username,
          email: maskEmail(user.email),
          role: user.role,
        },
      },
    });
  } catch (error) {
    logger.error("Login error:", {
      ip: req.ip,
      error: error.message,
    });
    next(error);
  }
};

// Rate limiter for login attempts
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // limit each IP to 5 login attempts per window
  message: "Too many login attempts, please try again after 15 minutes",
  standardHeaders: true,
  legacyHeaders: false,
});

const getProfile = async (req, res, next) => {
  try {
    logger.info("Profile access:", {
      userId: req.user._id,
      ip: req.ip,
    });

    // Since we're using .lean() in passport strategy, we need to fetch fresh user data
    const user = await User.findById(req.user._id).select("-password").lean();

    if (!user) {
      logger.error("Profile not found for authenticated user:", {
        userId: req.user._id,
      });
      return res.status(404).json({
        status: "error",
        message: "User profile not found",
      });
    }

    res.status(200).json({
      status: "success",
      data: {
        user: {
          id: user._id,
          username: user.username,
          email: maskEmail(user.email),
          role: user.role,
          lastLogin: user.lastLogin,
        },
      },
    });
  } catch (error) {
    logger.error("Profile retrieval error:", {
      userId: req.user._id,
      error: error.message,
    });
    next(error);
  }
};

// Add refresh token endpoint
const refreshAccessToken = async (req, res, next) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(400).json({
        status: "error",
        message: "Refresh token is required",
      });
    }

    // Verify refresh token
    const decoded = jwt.verify(refreshToken, config.jwt.secret);

    // Check if token is blacklisted
    const isBlacklisted = await TokenBlacklist.exists({ token: decoded.jti });
    if (isBlacklisted) {
      return res.status(401).json({
        status: "error",
        message: "Refresh token has been revoked",
      });
    }

    // Generate new tokens
    const user = await User.findById(decoded.id).select("-password");
    const tokens = generateTokens(user);

    // Blacklist old refresh token
    await TokenBlacklist.create({
      token: decoded.jti,
      expiresAt: new Date(decoded.exp * 1000),
    });

    res.status(200).json({
      status: "success",
      data: {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
      },
    });
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      return res.status(401).json({
        status: "error",
        message: "Refresh token has expired",
      });
    }
    next(error);
  }
};

// Add logout function
const logout = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(400).json({
        status: "error",
        message: "Authorization header is required",
      });
    }

    const token = authHeader.split(" ")[1];
    const decoded = jwt.decode(token);

    // Add token to blacklist
    await TokenBlacklist.create({
      token: decoded.jti,
      expiresAt: new Date(decoded.exp * 1000),
    });

    res.status(200).json({
      status: "success",
      message: "Logged out successfully",
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Exchange TrueLayer authorization code for access and refresh tokens
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const exchangeTrueLayerToken = async (req, res) => {
  const { code } = req.body;
  const userId = req.user.id;
  const clientIp = req.ip;

  try {
    if (!code) {
      logger.warn("Missing authorization code in token exchange request", {
        userId,
        clientIp,
      });
      return res.status(400).json({
        success: false,
        error: "MISSING_AUTH_CODE",
        message: "Authorization code is required",
      });
    }

    // Exchange the code for tokens
    const tokens = await TrueLayerService.exchangeAuthorizationCode(code);

    // Validate token expiration
    const expiresAt = new Date(Date.now() + tokens.expires_in * 1000);
    if (expiresAt <= new Date()) {
      logger.error("Received expired token from TrueLayer", {
        userId,
        clientIp,
        expiresAt,
      });
      return res.status(400).json({
        success: false,
        error: "INVALID_TOKEN_EXPIRATION",
        message: "Received token is already expired",
      });
    }

    // Find user and update tokens with concurrency control
    const user = await User.findById(userId);
    if (!user) {
      logger.error("User not found during token exchange", {
        userId,
        clientIp,
      });
      return res.status(404).json({
        success: false,
        error: "USER_NOT_FOUND",
        message: "User not found",
      });
    }

    try {
      const updatedUser = await user.updateTrueLayerTokens(tokens);

      logger.info("Successfully connected user to TrueLayer", {
        userId,
        clientIp,
        expiresAt: updatedUser.trueLayerTokenExpiresAt,
      });

      res.status(200).json({
        success: true,
        message: "TrueLayer connection successful",
        data: {
          isConnected: updatedUser.trueLayerConnected,
          expiresAt: updatedUser.trueLayerTokenExpiresAt,
        },
      });
    } catch (updateError) {
      logger.error("Failed to update user with TrueLayer tokens", {
        userId,
        clientIp,
        error: updateError.message,
      });
      return res.status(409).json({
        success: false,
        error: "TOKEN_UPDATE_FAILED",
        message: "Failed to update user tokens due to concurrent modification",
      });
    }
  } catch (error) {
    logger.error("TrueLayer token exchange error", {
      userId,
      clientIp,
      error: error.message,
      errorCode: error.response?.data?.error,
      statusCode: error.response?.status,
    });

    const statusCode = error.response?.status || 500;
    const errorResponse = {
      success: false,
      error: "TRUELAYER_EXCHANGE_FAILED",
      message: "Failed to connect to TrueLayer",
    };

    if (error.response?.data?.error) {
      errorResponse.details = error.response.data.error;
    }

    res.status(statusCode).json(errorResponse);
  }
};

module.exports = {
  register,
  registrationLimiter,
  login,
  loginLimiter,
  getProfile,
  refreshAccessToken,
  logout,
  exchangeTrueLayerToken,
};
