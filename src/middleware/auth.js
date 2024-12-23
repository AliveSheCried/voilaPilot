import passport from "passport";
import logger from "../config/logger.js";
import { AuthenticationError, AuthorizationError } from "../utils/errors.js";

/**
 * Middleware to authenticate requests using JWT
 */
const authenticate = (req, res, next) => {
  passport.authenticate("jwt", { session: false }, (err, user, info) => {
    if (err) {
      return next(err);
    }

    if (!user) {
      // Handle different authentication failures
      if (info.name === "TokenExpiredError") {
        return next(AuthenticationError.tokenExpired());
      }
      if (info.name === "JsonWebTokenError") {
        return next(AuthenticationError.tokenInvalid(info.message));
      }
      return next(AuthenticationError.credentialsInvalid());
    }

    // Attach user to request
    req.user = user;

    logger.debug("User authenticated successfully", {
      userId: user.id,
      path: req.path,
      method: req.method,
    });

    next();
  })(req, res, next);
};

/**
 * Middleware to check if user has required role
 * @param {string|string[]} roles - Required role(s)
 */
const authorize = (roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return next(
        AuthenticationError.credentialsInvalid("User not authenticated")
      );
    }

    const userRole = req.user.role;
    const allowedRoles = Array.isArray(roles) ? roles : [roles];

    if (!allowedRoles.includes(userRole)) {
      logger.warn("Unauthorized access attempt", {
        userId: req.user.id,
        userRole,
        requiredRoles: allowedRoles,
        path: req.path,
        method: req.method,
      });

      return next(
        AuthorizationError.roleRequired(
          allowedRoles.join(" or "),
          `Access requires role: ${allowedRoles.join(" or ")}`
        )
      );
    }

    logger.debug("User authorized successfully", {
      userId: req.user.id,
      userRole,
      path: req.path,
      method: req.method,
    });

    next();
  };
};

/**
 * Middleware to validate API key
 */
const validateApiKey = async (req, res, next) => {
  const apiKey = req.headers["x-api-key"];

  if (!apiKey) {
    return next(AuthenticationError.credentialsInvalid("API key is required"));
  }

  try {
    // Validate API key format
    if (!apiKey.match(/^vk_[a-zA-Z0-9]{32}$/)) {
      throw AuthenticationError.credentialsInvalid("Invalid API key format");
    }

    // Get user associated with API key
    const user = await User.findOne({
      "apiKeys.key": apiKey,
      "apiKeys.isActive": true,
      "apiKeys.expiresAt": { $gt: new Date() },
    });

    if (!user) {
      throw AuthenticationError.credentialsInvalid(
        "Invalid or expired API key"
      );
    }

    // Attach user and API key info to request
    req.user = user;
    req.apiKey = user.apiKeys.find((k) => k.key === apiKey);

    logger.debug("API key validated successfully", {
      userId: user.id,
      keyId: req.apiKey.id,
      path: req.path,
      method: req.method,
    });

    next();
  } catch (error) {
    next(error);
  }
};

/**
 * Middleware to check if request is from TrueLayer
 */
const validateTrueLayerWebhook = (req, res, next) => {
  const signature = req.headers["x-tl-webhook-signature"];

  if (!signature) {
    return next(
      AuthenticationError.credentialsInvalid(
        "Missing TrueLayer webhook signature"
      )
    );
  }

  try {
    // Verify webhook signature
    const isValid = verifyTrueLayerSignature(req.body, signature);

    if (!isValid) {
      throw AuthenticationError.credentialsInvalid(
        "Invalid TrueLayer webhook signature"
      );
    }

    logger.debug("TrueLayer webhook validated successfully", {
      path: req.path,
      method: req.method,
      webhookType: req.body.type,
    });

    next();
  } catch (error) {
    next(error);
  }
};

export { authenticate as authenticateJWT, authorize };
