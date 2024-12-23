import axios from "axios";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import config from "../config/config.js";
import logger from "../config/logger.js";

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
}

// Create and export singleton instance
const trueLayerService = new TrueLayerService();
export default trueLayerService;
