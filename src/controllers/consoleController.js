const User = require("../models/User");
const ApiKeyService = require("../services/apiKeyService");
const logger = require("../config/logger");

/**
 * Get all API keys for the authenticated user
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const getApiKeys = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select("apiKeys").lean();

    if (!user) {
      logger.warn("User not found when fetching API keys", {
        userId: req.user.id,
        ip: req.ip,
      });
      return res.status(404).json({
        success: false,
        error: "USER_NOT_FOUND",
        message: "User not found",
      });
    }

    // Map API keys to a safe format for response
    const safeKeys = user.apiKeys.map((key) => ({
      id: key._id,
      name: key.name,
      key: ApiKeyService.maskKey(key.key),
      createdAt: key.createdAt,
      lastUsed: key.lastUsed,
      expiresAt: key.expiresAt,
      isActive: key.isActive,
    }));

    logger.info("API keys retrieved successfully", {
      userId: req.user.id,
      keyCount: safeKeys.length,
      ip: req.ip,
    });

    res.status(200).json({
      success: true,
      data: {
        keys: safeKeys,
        total: safeKeys.length,
        limit: 5, // Maximum number of keys allowed
      },
    });
  } catch (error) {
    logger.error("Failed to retrieve API keys", {
      userId: req.user.id,
      error: error.message,
      ip: req.ip,
    });

    res.status(500).json({
      success: false,
      error: "INTERNAL_ERROR",
      message: "Failed to retrieve API keys",
    });
  }
};

module.exports = {
  getApiKeys,
};
