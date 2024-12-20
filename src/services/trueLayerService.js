const axios = require("axios");
const config = require("../config/config");
const logger = require("../config/logger");
const { TrueLayerError } = require("../utils/errors");

class TrueLayerService {
  static instance = null;

  constructor() {
    if (TrueLayerService.instance) {
      return TrueLayerService.instance;
    }

    this.initializeAxios();
    this.initializeTokenCache();
    TrueLayerService.instance = this;
  }

  initializeAxios() {
    this.api = axios.create({
      baseURL: config.trueLayer.apiUrl,
      timeout: config.trueLayer.timeout,
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
    });

    this.api.interceptors.response.use(
      (response) => response,
      this.handleApiError.bind(this)
    );
  }

  initializeTokenCache() {
    this.tokenCache = {
      token: null,
      expiresAt: null,
    };
  }

  /**
   * Validate private key format
   * @private
   */
  validatePrivateKey(privateKey) {
    if (!privateKey?.includes("BEGIN EC PRIVATE KEY")) {
      throw new Error("Invalid private key format");
    }
    return privateKey.replace(/\\n/g, "\n");
  }

  /**
   * Check if cached token is valid
   * @private
   */
  isTokenValid() {
    return (
      this.tokenCache.token &&
      this.tokenCache.expiresAt &&
      this.tokenCache.expiresAt > Date.now() + 30000 // 30s buffer
    );
  }

  /**
   * Generate a signed JWT assertion for client credentials flow
   * @returns {string} Signed JWT assertion
   */
  async generateJWTAssertion() {
    try {
      const privateKey = this.validatePrivateKey(config.trueLayer.privateKey);

      const now = Math.floor(Date.now() / 1000);
      const payload = {
        iss: config.trueLayer.clientId,
        sub: config.trueLayer.clientId,
        aud: `${config.trueLayer.authUrl}${config.trueLayer.tokenEndpoint}`,
        iat: now,
        exp: now + 300,
        jti: crypto.randomUUID(),
      };

      return jwt.sign(payload, privateKey, {
        algorithm: "ES512",
        header: {
          kid: config.trueLayer.kid,
        },
      });
    } catch (error) {
      logger.error("Error generating JWT assertion:", {
        error: error.message,
        stack: error.stack,
      });
      throw new Error("Failed to generate JWT assertion");
    }
  }

  /**
   * Get access token using client credentials flow
   * @returns {Promise<string>} Access token
   */
  async getAccessToken() {
    try {
      // Return cached token if valid
      if (this.isTokenValid()) {
        logger.debug("Using cached access token");
        return this.tokenCache.token;
      }

      const assertion = await this.generateJWTAssertion();

      const response = await this.api.post(config.trueLayer.tokenEndpoint, {
        grant_type: "client_credentials",
        client_assertion_type:
          "urn:ietf:params:oauth:client-assertion-type:jwt-bearer",
        client_assertion: assertion,
        scope: config.trueLayer.scopes.join(" "),
      });

      // Cache the new token
      this.tokenCache = {
        token: response.data.access_token,
        expiresAt: Date.now() + response.data.expires_in * 1000,
      };

      logger.info("Successfully obtained TrueLayer access token", {
        expiresIn: response.data.expires_in,
      });

      return this.tokenCache.token;
    } catch (error) {
      logger.error("Error getting TrueLayer access token:", {
        error: error.message,
        stack: error.stack,
      });
      throw new Error("Failed to obtain TrueLayer access token");
    }
  }

  /**
   * Handle API errors with retry logic
   * @param {Error} error - Axios error object
   * @returns {Promise} - Retried request or thrown error
   */
  async handleApiError(error) {
    const { config: axiosConfig, response } = error;

    const shouldRetry =
      // Retry on 5xx errors
      response?.status >= 500 ||
      // Retry on timeout errors
      error.code === "ECONNABORTED" ||
      // Retry on network errors
      !response;

    if (shouldRetry && axiosConfig?._retry < config.trueLayer.retryAttempts) {
      axiosConfig._retry = (axiosConfig._retry || 0) + 1;
      const delay = Math.pow(2, axiosConfig._retry) * 1000;

      logger.warn("Retrying TrueLayer API request:", {
        attempt: axiosConfig._retry,
        maxAttempts: config.trueLayer.retryAttempts,
        delayMs: delay,
        status: response?.status,
        endpoint: axiosConfig.url,
        errorCode: error.code,
      });

      await new Promise((resolve) => setTimeout(resolve, delay));
      return this.api(axiosConfig);
    }

    // Clear token cache on 401 errors
    if (response?.status === 401) {
      this.tokenCache = { token: null, expiresAt: null };
    }

    logger.error("TrueLayer API error:", {
      status: response?.status,
      endpoint: axiosConfig?.url,
      error: error.message,
      retryCount: axiosConfig?._retry || 0,
    });

    throw error;
  }

  /**
   * Make an authenticated request to TrueLayer API
   * @param {string} method - HTTP method
   * @param {string} endpoint - API endpoint
   * @param {Object} [data] - Request body for POST/PUT requests
   * @returns {Promise<Object>} API response
   */
  async makeAuthenticatedRequest(method, endpoint, data = null) {
    try {
      const accessToken = await this.getAccessToken();

      const response = await this.api({
        method,
        url: endpoint,
        data,
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      return response.data;
    } catch (error) {
      logger.error("Error making authenticated request to TrueLayer:", {
        endpoint,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Exchange authorization code for access and refresh tokens
   * @param {string} code - Authorization code from TrueLayer
   * @returns {Promise<Object>} Tokens response
   */
  async exchangeAuthorizationCode(code) {
    try {
      const response = await this.api.post(config.trueLayer.tokenEndpoint, {
        grant_type: "authorization_code",
        client_id: config.trueLayer.clientId,
        code,
        redirect_uri: config.trueLayer.redirectUri,
      });

      return response.data;
    } catch (error) {
      logger.error("Failed to exchange authorization code", {
        error: error.message,
        errorCode: error.response?.data?.error,
        statusCode: error.response?.status,
      });
      throw this.createTrueLayerError(
        "Failed to exchange authorization code",
        error
      );
    }
  }

  /**
   * Validate and refresh TrueLayer tokens if needed
   * @param {Object} user - User document containing TrueLayer tokens
   * @returns {Promise<Object>} Updated tokens
   */
  async validateAndRefreshTokens(user) {
    if (!user.trueLayerAccessToken || !user.trueLayerRefreshToken) {
      throw this.createTrueLayerError(
        "User not properly connected to TrueLayer",
        { status: 400 }
      );
    }

    const expiresAt = new Date(user.trueLayerTokenExpiresAt);
    if (!expiresAt || isNaN(expiresAt)) {
      throw this.createTrueLayerError("Invalid token expiration date", {
        status: 400,
      });
    }

    const now = new Date();
    const fiveMinutes = 5 * 60 * 1000;

    if (expiresAt <= new Date(now.getTime() + fiveMinutes)) {
      try {
        return await this.refreshTokens(user.trueLayerRefreshToken);
      } catch (error) {
        if (error.response?.status === 400) {
          throw this.createTrueLayerError("Invalid refresh token", error);
        }
        if (error.response?.status === 401) {
          throw this.createTrueLayerError(
            "TrueLayer connection expired. Please reconnect your account.",
            error
          );
        }
        throw error;
      }
    }

    return {
      access_token: user.trueLayerAccessToken,
      refresh_token: user.trueLayerRefreshToken,
      expires_in: Math.floor((expiresAt - now) / 1000),
    };
  }

  /**
   * Refresh TrueLayer tokens using refresh token
   * @param {string} refreshToken - TrueLayer refresh token
   * @returns {Promise<Object>} New tokens
   */
  async refreshTokens(refreshToken) {
    try {
      const response = await this.api.post(config.trueLayer.tokenEndpoint, {
        grant_type: "refresh_token",
        client_id: config.trueLayer.clientId,
        refresh_token: refreshToken,
      });

      return response.data;
    } catch (error) {
      logger.error("Failed to refresh TrueLayer tokens", {
        error: error.message,
        errorCode: error.response?.data?.error,
        statusCode: error.response?.status,
      });
      throw this.createTrueLayerError(
        "Failed to refresh TrueLayer tokens",
        error
      );
    }
  }

  /**
   * Revoke TrueLayer token
   * @param {string} token - Token to revoke
   * @returns {Promise<void>}
   */
  async revokeToken(token) {
    try {
      await this.api.post(config.trueLayer.revokeEndpoint, {
        token,
      });
    } catch (error) {
      logger.error("Failed to revoke TrueLayer token", {
        error: error.message,
        errorCode: error.response?.data?.error,
        statusCode: error.response?.status,
      });
      throw this.createTrueLayerError(
        "Failed to revoke TrueLayer token",
        error
      );
    }
  }

  /**
   * Create a standardized error object for TrueLayer API errors
   * @private
   */
  createTrueLayerError(message, originalError) {
    const error = new Error(message);
    error.statusCode = originalError.response?.status || 500;
    error.details = originalError.response?.data?.error;
    error.originalError = originalError;
    return error;
  }

  /**
   * Validate transaction query parameters
   * @private
   */
  validateTransactionParams(options) {
    const { from, to, limit } = options;

    if (from && !this.isValidISODate(from)) {
      throw new Error(
        "Invalid 'from' date format. Must be ISO 8601 (YYYY-MM-DD)"
      );
    }

    if (to && !this.isValidISODate(to)) {
      throw new Error(
        "Invalid 'to' date format. Must be ISO 8601 (YYYY-MM-DD)"
      );
    }

    if (limit && (!Number.isInteger(limit) || limit < 1 || limit > 100)) {
      throw new Error("Limit must be between 1 and 100");
    }

    // Validate date range
    if (from && to && new Date(from) > new Date(to)) {
      throw new Error("'from' date must be before 'to' date");
    }
  }

  /**
   * Validate ISO 8601 date format (YYYY-MM-DD)
   * @private
   */
  isValidISODate(dateString) {
    const regex = /^\d{4}-\d{2}-\d{2}$/;
    if (!regex.test(dateString)) return false;
    const date = new Date(dateString);
    return date instanceof Date && !isNaN(date);
  }

  /**
   * Get user's bank accounts
   * @param {string} accessToken - TrueLayer access token
   * @returns {Promise<Array>} List of accounts
   */
  async getAccounts(accessToken) {
    try {
      const response = await this.api.get("/data/v1/accounts", {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      // Transform and sanitize account data
      return response.data.results.map((account) =>
        this.sanitizeAccountData(account)
      );
    } catch (error) {
      logger.error("Failed to fetch accounts from TrueLayer", {
        error: error.message,
        errorCode: error.response?.data?.error,
        statusCode: error.response?.status,
      });
      throw this.createTrueLayerError("Failed to fetch accounts", error);
    }
  }

  /**
   * Sanitize account data
   * @private
   */
  sanitizeAccountData(account) {
    return {
      id: account.account_id,
      accountType: account.account_type,
      displayName: account.display_name,
      currency: account.currency,
      accountNumber: account.account_number?.number
        ? `****${account.account_number.number.slice(-4)}`
        : null,
      sortCode: account.account_number?.sort_code,
      provider: {
        id: account.provider.provider_id,
        name: account.provider.display_name,
      },
      balance: {
        available: account.balance,
        current: account.current,
        timestamp: account.update_timestamp,
      },
    };
  }

  /**
   * Get transactions for an account
   * @param {string} accessToken - TrueLayer access token
   * @param {Object} options - Query options
   * @returns {Promise<Array>} List of transactions
   */
  async getTransactions(accessToken, options) {
    try {
      // Validate query parameters
      this.validateTransactionParams(options);

      const { accountId, from, to, limit } = options;
      const endpoint = accountId
        ? `/data/v1/accounts/${accountId}/transactions`
        : "/data/v1/transactions";

      const params = new URLSearchParams();
      if (from) params.append("from", from);
      if (to) params.append("to", to);
      if (limit) params.append("limit", limit.toString());

      const response = await this.api.get(`${endpoint}?${params.toString()}`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      // Transform and sanitize transaction data
      return response.data.results.map((transaction) =>
        this.sanitizeTransactionData(transaction)
      );
    } catch (error) {
      logger.error("Failed to fetch transactions from TrueLayer", {
        error: error.message,
        errorCode: error.response?.data?.error,
        statusCode: error.response?.status,
        accountId: options.accountId,
      });
      throw this.createTrueLayerError("Failed to fetch transactions", error);
    }
  }

  /**
   * Sanitize transaction data
   * @private
   */
  sanitizeTransactionData(transaction) {
    return {
      id: transaction.transaction_id,
      timestamp: transaction.timestamp,
      description: transaction.description,
      amount: transaction.amount,
      currency: transaction.currency,
      transactionType: transaction.transaction_type,
      transactionCategory: transaction.transaction_category,
      merchantName: transaction.merchant_name,
      runningBalance: transaction.running_balance,
      metadata: {
        provider: transaction.provider?.display_name,
        category: transaction.transaction_classification?.[0],
      },
    };
  }

  async exchangeToken(code) {
    try {
      const response = await this.client.post("/connect/token", {
        grant_type: "authorization_code",
        client_id: config.trueLayer.clientId,
        client_secret: config.trueLayer.clientSecret,
        code,
        redirect_uri: config.trueLayer.redirectUri,
      });

      logger.info("TrueLayer token exchange successful");
      return response.data;
    } catch (error) {
      throw TrueLayerError.tokenExchangeFailed(
        "Failed to exchange authorization code",
        {
          code,
          originalError: error.message,
        }
      );
    }
  }

  async getAccounts(accessToken) {
    try {
      const response = await this.client.get("/data/v1/accounts", {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      logger.info("Retrieved accounts from TrueLayer");
      return response.data.results;
    } catch (error) {
      throw TrueLayerError.dataRetrievalFailed("Failed to retrieve accounts", {
        endpoint: "/data/v1/accounts",
        originalError: error.message,
      });
    }
  }

  async getTransactions(accessToken, accountId, params = {}) {
    try {
      const response = await this.client.get(
        `/data/v1/accounts/${accountId}/transactions`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
          params: {
            from: params.from,
            to: params.to,
            limit: params.limit || 100,
          },
        }
      );

      logger.info("Retrieved transactions from TrueLayer", {
        accountId,
        count: response.data.results.length,
      });

      return response.data.results;
    } catch (error) {
      throw TrueLayerError.dataRetrievalFailed(
        "Failed to retrieve transactions",
        {
          accountId,
          params,
          endpoint: `/data/v1/accounts/${accountId}/transactions`,
          originalError: error.message,
        }
      );
    }
  }

  async refreshAccessToken(refreshToken) {
    try {
      const response = await this.client.post("/connect/token", {
        grant_type: "refresh_token",
        client_id: config.trueLayer.clientId,
        client_secret: config.trueLayer.clientSecret,
        refresh_token: refreshToken,
      });

      logger.info("TrueLayer access token refreshed successfully");
      return response.data;
    } catch (error) {
      throw TrueLayerError.authenticationFailed(
        "Failed to refresh access token",
        {
          originalError: error.message,
        }
      );
    }
  }

  // Helper method to handle API errors
  handleApiError(error) {
    if (error.response) {
      // The request was made and the server responded with a status code
      // that falls out of the range of 2xx
      const { status, data } = error.response;

      switch (status) {
        case 401:
          throw TrueLayerError.authenticationFailed(
            "TrueLayer authentication failed",
            {
              status,
              error: data.error,
              description: data.error_description,
            }
          );

        case 429:
          throw TrueLayerError.rateLimit("TrueLayer rate limit exceeded", {
            status,
            error: data.error,
            retryAfter: error.response.headers["retry-after"],
          });

        default:
          throw TrueLayerError.dataRetrievalFailed(
            "TrueLayer API request failed",
            {
              status,
              error: data.error,
              description: data.error_description,
            }
          );
      }
    } else if (error.request) {
      // The request was made but no response was received
      throw TrueLayerError.connectionFailed(
        "No response received from TrueLayer",
        {
          timeout: error.code === "ECONNABORTED",
          originalError: error.message,
        }
      );
    } else {
      // Something happened in setting up the request that triggered an Error
      throw TrueLayerError.connectionFailed(
        "Failed to make request to TrueLayer",
        {
          originalError: error.message,
        }
      );
    }
  }

  // Utility method to validate access token format
  validateAccessToken(accessToken) {
    if (
      !accessToken ||
      typeof accessToken !== "string" ||
      !accessToken.startsWith("Bearer ")
    ) {
      throw TrueLayerError.authenticationFailed("Invalid access token format", {
        providedToken: accessToken,
      });
    }
    return true;
  }
}

// Export singleton instance
module.exports = new TrueLayerService();
