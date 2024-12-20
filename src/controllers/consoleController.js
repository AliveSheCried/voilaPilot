const User = require("../models/User");
const logger = require("../config/logger");
const ApiKeyService = require("../services/apiKeyService");
const { createSafeLoggingContext } = require("../utils/masking");
const {
  ApiKeyNotFoundError,
  ApiKeyError,
  ResourceNotFoundError,
  ValidationError,
} = require("../utils/errors");

/**
 * Create a new API key for the user
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const createKey = async (req, res) => {
  try {
    const { name, expiresIn } = req.validatedData;
    const userId = req.user.id;

    // Find user and check key limit
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        error: "USER_NOT_FOUND",
        message: "User not found",
      });
    }

    if (user.apiKeyCount >= 5) {
      logger.warn("API key limit reached", {
        userId,
        currentCount: user.apiKeyCount,
      });

      return res.status(400).json({
        success: false,
        error: "KEY_LIMIT_REACHED",
        message: "Maximum number of API keys (5) reached",
      });
    }

    // Generate and add new key
    const { key, id } = await user.addApiKey(name, expiresIn);

    logger.info("API key created successfully", {
      userId,
      keyId: id,
      name,
      expiresIn,
    });

    // Return the plaintext key (will only be shown once)
    res.status(201).json({
      success: true,
      data: {
        key,
        id,
        name,
        createdAt: new Date(),
        expiresIn,
      },
      message:
        "API key created successfully. Please save this key as it won't be shown again.",
    });
  } catch (error) {
    logger.error("Failed to create API key", {
      userId: req.user?.id,
      error: error.message,
    });

    res.status(500).json({
      success: false,
      error: "KEY_CREATION_FAILED",
      message: "Failed to create API key",
    });
  }
};

/**
 * Get all API keys for the user
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const getApiKeys = async (req, res) => {
  try {
    const userId = req.user.id;
    const user = await User.findById(userId).select("apiKeys");

    if (!user) {
      return res.status(404).json({
        success: false,
        error: "USER_NOT_FOUND",
        message: "User not found",
      });
    }

    // Mask sensitive data and format response
    const keys = user.apiKeys.map((key) => ({
      id: key._id,
      name: key.name,
      createdAt: key.createdAt,
      lastUsed: key.lastUsed,
      expiresAt: key.expiresAt,
      isActive: key.isActive,
    }));

    res.json({
      success: true,
      data: keys,
    });
  } catch (error) {
    logger.error("Failed to retrieve API keys", {
      userId: req.user?.id,
      error: error.message,
    });

    res.status(500).json({
      success: false,
      error: "KEY_RETRIEVAL_FAILED",
      message: "Failed to retrieve API keys",
    });
  }
};

/**
 * Delete an API key
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const deleteKey = async (req, res) => {
  const { keyId } = req.params;
  const userId = req.user.id;
  const correlationId = req.correlationId;

  try {
    // Find user
    const user = await User.findById(userId);
    if (!user) {
      throw new ResourceNotFoundError("User");
    }

    // Find the key in user's keys
    const keyIndex = user.apiKeys.findIndex(
      (key) => key._id.toString() === keyId
    );
    if (keyIndex === -1) {
      throw new ApiKeyNotFoundError();
    }

    const key = user.apiKeys[keyIndex];

    // Check if key is already inactive
    if (!key.isActive) {
      throw new ApiKeyError(
        "API key is already inactive",
        "KEY_ALREADY_INACTIVE"
      );
    }

    // Check if key is expired
    if (key.expiresAt && new Date(key.expiresAt) < new Date()) {
      throw new ApiKeyError("API key is expired", "KEY_EXPIRED");
    }

    // Store key info for logging
    const keyInfo = {
      name: key.name,
      createdAt: key.createdAt,
      lastUsed: key.lastUsed,
      expiresAt: key.expiresAt,
    };

    // Remove the key
    user.apiKeys.splice(keyIndex, 1);
    await user.save();

    // Log the deletion with safe context
    logger.info(
      "API key deleted",
      createSafeLoggingContext({
        userId,
        keyId,
        keyName: keyInfo.name,
        keyAge: Date.now() - keyInfo.createdAt,
        remainingKeys: user.apiKeys.length,
        correlationId,
        lastUsed: keyInfo.lastUsed ? Date.now() - keyInfo.lastUsed : null,
      })
    );

    // Track metrics for key deletion
    await ApiKeyService.trackDeletion({
      userId,
      keyId,
      reason: "user_requested",
      keyAge: Date.now() - keyInfo.createdAt,
      lastUsed: keyInfo.lastUsed,
    });

    // Return success response
    res.status(200).json({
      success: true,
      message: "API key deleted successfully",
      data: {
        remainingKeys: user.apiKeys.length,
        deletedKey: {
          id: keyId,
          name: keyInfo.name,
          createdAt: keyInfo.createdAt,
          lastUsed: keyInfo.lastUsed,
          expiresAt: keyInfo.expiresAt,
        },
      },
    });
  } catch (error) {
    logger.error("Failed to delete API key", {
      error: error.message,
      userId,
      keyId,
      errorCode: error.errorCode,
      correlationId,
    });

    // Handle specific errors
    if (
      error instanceof ResourceNotFoundError ||
      error instanceof ApiKeyNotFoundError ||
      error instanceof ApiKeyError
    ) {
      return res.status(error.statusCode).json({
        success: false,
        error: error.errorCode,
        message: error.message,
      });
    }

    // Handle validation errors
    if (error instanceof ValidationError) {
      return res.status(400).json({
        success: false,
        error: "VALIDATION_ERROR",
        message: error.message,
        details: error.details,
      });
    }

    // Handle unexpected errors
    res.status(500).json({
      success: false,
      error: "INTERNAL_ERROR",
      message: "Failed to delete API key",
      ...(process.env.NODE_ENV === "development" && { stack: error.stack }),
    });
  }
};

module.exports = {
  createKey,
  getApiKeys,
  deleteKey,
};
