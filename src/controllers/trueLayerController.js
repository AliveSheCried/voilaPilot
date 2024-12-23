import logger from "../config/logger.js";
import User from "../models/User.js";
import TrueLayerService from "../services/trueLayerService.js";

/**
 * Get user's bank accounts from TrueLayer
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const getAccounts = async (req, res) => {
  const userId = req.user.id;
  const clientIp = req.ip;

  try {
    // Get user with TrueLayer tokens
    const user = await User.findById(userId).select(
      "+trueLayerAccessToken +trueLayerRefreshToken"
    );

    if (!user) {
      logger.error("User not found during accounts fetch", {
        userId,
        clientIp,
      });
      return res.status(404).json({
        success: false,
        error: "USER_NOT_FOUND",
        message: "User not found",
      });
    }

    if (!user.trueLayerConnected) {
      return res.status(400).json({
        success: false,
        error: "NOT_CONNECTED",
        message: "User not connected to TrueLayer",
      });
    }

    // Validate and refresh tokens if needed
    const validTokens = await TrueLayerService.validateAndRefreshTokens(user);
    if (validTokens !== user.trueLayerAccessToken) {
      await user.updateTrueLayerTokens(validTokens);
    }

    // Fetch accounts from TrueLayer
    const accounts = await TrueLayerService.getAccounts(
      validTokens.access_token
    );

    logger.info("Successfully retrieved user accounts", {
      userId,
      clientIp,
      accountCount: accounts.length,
    });

    res.status(200).json({
      success: true,
      data: accounts,
    });
  } catch (error) {
    logger.error("Failed to fetch accounts", {
      userId,
      clientIp,
      error: error.message,
      errorCode: error.response?.data?.error,
      statusCode: error.response?.status,
    });

    const statusCode = error.statusCode || 500;
    const errorResponse = {
      success: false,
      error: "ACCOUNTS_FETCH_FAILED",
      message: "Failed to fetch accounts",
    };

    if (error.details) {
      errorResponse.details = error.details;
    }

    res.status(statusCode).json(errorResponse);
  }
};

/**
 * Get user's transactions from TrueLayer
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const getTransactions = async (req, res) => {
  const userId = req.user.id;
  const clientIp = req.ip;
  const { accountId } = req.params;
  const { from, to, limit = 50 } = req.query;

  try {
    // Validate date parameters
    if (from && !isValidDate(from)) {
      return res.status(400).json({
        success: false,
        error: "INVALID_DATE",
        message: "Invalid 'from' date format. Use ISO 8601 format (YYYY-MM-DD)",
      });
    }

    if (to && !isValidDate(to)) {
      return res.status(400).json({
        success: false,
        error: "INVALID_DATE",
        message: "Invalid 'to' date format. Use ISO 8601 format (YYYY-MM-DD)",
      });
    }

    // Get user with TrueLayer tokens
    const user = await User.findById(userId).select(
      "+trueLayerAccessToken +trueLayerRefreshToken"
    );

    if (!user) {
      logger.error("User not found during transactions fetch", {
        userId,
        clientIp,
      });
      return res.status(404).json({
        success: false,
        error: "USER_NOT_FOUND",
        message: "User not found",
      });
    }

    if (!user.trueLayerConnected) {
      return res.status(400).json({
        success: false,
        error: "NOT_CONNECTED",
        message: "User not connected to TrueLayer",
      });
    }

    // Validate and refresh tokens if needed
    const validTokens = await TrueLayerService.validateAndRefreshTokens(user);
    if (validTokens !== user.trueLayerAccessToken) {
      await user.updateTrueLayerTokens(validTokens);
    }

    // Fetch transactions from TrueLayer
    const transactions = await TrueLayerService.getTransactions(
      validTokens.access_token,
      {
        accountId,
        from,
        to,
        limit: Math.min(limit, 100), // Cap at 100 transactions
      }
    );

    logger.info("Successfully retrieved user transactions", {
      userId,
      clientIp,
      accountId,
      transactionCount: transactions.length,
    });

    res.status(200).json({
      success: true,
      data: transactions,
    });
  } catch (error) {
    logger.error("Failed to fetch transactions", {
      userId,
      clientIp,
      accountId,
      error: error.message,
      errorCode: error.response?.data?.error,
      statusCode: error.response?.status,
    });

    const statusCode = error.statusCode || 500;
    const errorResponse = {
      success: false,
      error: "TRANSACTIONS_FETCH_FAILED",
      message: "Failed to fetch transactions",
    };

    if (error.details) {
      errorResponse.details = error.details;
    }

    res.status(statusCode).json(errorResponse);
  }
};

/**
 * Validate ISO 8601 date format (YYYY-MM-DD)
 * @private
 */
function isValidDate(dateString) {
  const regex = /^\d{4}-\d{2}-\d{2}$/;
  if (!regex.test(dateString)) return false;

  const date = new Date(dateString);
  return date instanceof Date && !isNaN(date);
}

export { getAccounts, getTransactions };
