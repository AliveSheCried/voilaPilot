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
const {
  AuthenticationError,
  RegistrationError,
  ValidationError,
  DatabaseError,
} = require("../utils/errors");

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
    const { email, password } = req.body;

    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      throw RegistrationError.emailInUse();
    }

    // Validate password strength
    if (!isPasswordStrong(password)) {
      throw RegistrationError.passwordWeak();
    }

    // Create new user
    const user = new User({ email, password });
    await user.save().catch((err) => {
      if (err.name === "ValidationError") {
        throw new ValidationError("Invalid registration data", err.errors);
      }
      throw DatabaseError.queryFailed({
        operation: "create_user",
        error: err.message,
      });
    });

    // Generate tokens
    const { accessToken, refreshToken } = generateTokens(user);

    logger.info("User registered successfully", {
      userId: user.id,
      email: user.email,
    });

    res.status(201).json({
      success: true,
      data: {
        user: {
          id: user.id,
          email: user.email,
          role: user.role,
        },
        tokens: {
          accessToken,
          refreshToken,
        },
      },
    });
  } catch (error) {
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
    const { email, password } = req.body;

    // Find user and check password
    const user = await User.findOne({ email }).select("+password");
    if (!user || !(await user.comparePassword(password))) {
      throw AuthenticationError.credentialsInvalid();
    }

    // Generate tokens
    const { accessToken, refreshToken } = generateTokens(user);

    logger.info("User logged in successfully", {
      userId: user.id,
      email: user.email,
    });

    res.json({
      success: true,
      data: {
        user: {
          id: user.id,
          email: user.email,
          role: user.role,
        },
        tokens: {
          accessToken,
          refreshToken,
        },
      },
    });
  } catch (error) {
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
const refreshToken = async (req, res, next) => {
  try {
    const { refreshToken } = req.body;

    // Verify refresh token
    const decoded = jwt.verify(refreshToken, config.jwt.refreshSecret);

    // Check if token is blacklisted
    const isBlacklisted = await TokenBlacklist.exists({ token: refreshToken });
    if (isBlacklisted) {
      throw AuthenticationError.tokenBlacklisted();
    }

    // Find user
    const user = await User.findById(decoded.id);
    if (!user) {
      throw AuthenticationError.tokenInvalid("User not found");
    }

    // Generate new tokens
    const tokens = generateTokens(user);

    // Blacklist old refresh token
    await TokenBlacklist.create({ token: refreshToken });

    logger.info("Tokens refreshed successfully", { userId: user.id });

    res.json({
      success: true,
      data: { tokens },
    });
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      next(AuthenticationError.tokenExpired());
    } else if (error instanceof jwt.JsonWebTokenError) {
      next(AuthenticationError.tokenInvalid());
    } else {
      next(error);
    }
  }
};

// Add logout function
const logout = async (req, res, next) => {
  try {
    const { refreshToken } = req.body;

    // Add refresh token to blacklist
    await TokenBlacklist.create({ token: refreshToken });

    logger.info("User logged out successfully", { userId: req.user.id });

    res.json({
      success: true,
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

const isPasswordStrong = (password) => {
  // Minimum 8 characters, at least one uppercase letter, one lowercase letter,
  // one number and one special character
  const strongPasswordRegex =
    /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
  return strongPasswordRegex.test(password);
};

module.exports = {
  register,
  registrationLimiter,
  login,
  loginLimiter,
  getProfile,
  refreshToken,
  logout,
  exchangeTrueLayerToken,
};
