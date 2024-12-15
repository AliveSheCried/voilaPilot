const axios = require("axios");
const jwt = require("jsonwebtoken");
const TrueLayerService = require("../../services/trueLayerService");
const config = require("../../config/config");

// Mock axios and jwt
jest.mock("axios");
jest.mock("jsonwebtoken");

describe("TrueLayerService", () => {
  let mockAxiosCreate;
  let originalConfig;

  beforeAll(() => {
    // Store original config
    originalConfig = { ...config.trueLayer };
  });

  beforeEach(() => {
    // Clear all mocks before each test
    jest.clearAllMocks();
    // Restore original config
    config.trueLayer = { ...originalConfig };

    // Mock axios.create to return our mock axios instance
    mockAxiosCreate = {
      post: jest.fn(),
      interceptors: {
        response: {
          use: jest.fn(),
        },
      },
    };
    axios.create.mockReturnValue(mockAxiosCreate);
  });

  describe("Service Initialization", () => {
    it("should throw error with invalid private key format", () => {
      config.trueLayer.privateKey = "invalid-key";

      expect(() => {
        TrueLayerService.validatePrivateKey(config.trueLayer.privateKey);
      }).toThrow("Invalid private key format");
    });

    it("should handle missing configuration", () => {
      config.trueLayer.apiUrl = undefined;

      expect(() => {
        new TrueLayerService();
      }).toThrow("TrueLayer API URL is not configured");
    });
  });

  describe("Token Cache Management", () => {
    it("should use cached token when valid", async () => {
      const mockToken = "cached.token";
      TrueLayerService.tokenCache = {
        token: mockToken,
        expiresAt: Date.now() + 60000, // Valid for 1 minute
      };

      const token = await TrueLayerService.getAccessToken();

      expect(token).toBe(mockToken);
      expect(mockAxiosCreate.post).not.toHaveBeenCalled();
    });

    it("should refresh token when expired", async () => {
      const mockToken = "new.token";
      TrueLayerService.tokenCache = {
        token: "old.token",
        expiresAt: Date.now() - 1000, // Expired
      };

      mockAxiosCreate.post.mockResolvedValue({
        data: {
          access_token: mockToken,
          expires_in: 3600,
        },
      });

      const token = await TrueLayerService.getAccessToken();

      expect(token).toBe(mockToken);
      expect(mockAxiosCreate.post).toHaveBeenCalled();
    });

    it("should clear token cache on 401 error", async () => {
      TrueLayerService.tokenCache = {
        token: "some.token",
        expiresAt: Date.now() + 3600000,
      };

      const error = {
        config: { _retry: 0 },
        response: { status: 401 },
      };

      await expect(TrueLayerService.handleApiError(error)).rejects.toThrow();
      expect(TrueLayerService.tokenCache.token).toBeNull();
      expect(TrueLayerService.tokenCache.expiresAt).toBeNull();
    });
  });

  describe("Error Handling", () => {
    it("should provide detailed error messages for API failures", async () => {
      const errorMessage = "API rate limit exceeded";
      mockAxiosCreate.post.mockRejectedValue({
        response: {
          status: 429,
          data: { error: errorMessage },
        },
      });

      await expect(TrueLayerService.getAccessToken()).rejects.toThrow(
        "Failed to obtain TrueLayer access token"
      );
    });

    it("should handle network timeouts", async () => {
      const error = {
        code: "ECONNABORTED",
        config: { _retry: 0 },
      };

      jest.spyOn(global, "setTimeout").mockImplementation((cb) => cb());

      await expect(TrueLayerService.handleApiError(error)).rejects.toThrow();

      expect(error.config._retry).toBe(1);
    });

    it("should handle network errors without response", async () => {
      const error = {
        code: "ECONNREFUSED",
        config: { _retry: 0 },
      };

      jest.spyOn(global, "setTimeout").mockImplementation((cb) => cb());

      await expect(TrueLayerService.handleApiError(error)).rejects.toThrow();

      expect(error.config._retry).toBe(1);
    });
  });

  describe("Retry Logic", () => {
    it("should respect maximum retry attempts", async () => {
      const error = {
        config: { _retry: config.trueLayer.retryAttempts },
        response: { status: 500 },
      };

      await expect(TrueLayerService.handleApiError(error)).rejects.toThrow();

      expect(error.config._retry).toBe(config.trueLayer.retryAttempts);
    });

    it("should implement exponential backoff", async () => {
      const delays = [];
      jest.spyOn(global, "setTimeout").mockImplementation((cb, delay) => {
        delays.push(delay);
        cb();
      });

      const error = {
        config: { _retry: 0 },
        response: { status: 500 },
      };

      await expect(TrueLayerService.handleApiError(error)).rejects.toThrow();

      // Verify exponential increase in delays
      expect(delays[1]).toBeGreaterThan(delays[0]);
      expect(delays[2]).toBeGreaterThan(delays[1]);
    });
  });

  describe("generateJWTAssertion", () => {
    it("should generate a valid JWT assertion", async () => {
      const mockJWT = "mock.jwt.token";
      jwt.sign.mockReturnValue(mockJWT);

      const assertion = await TrueLayerService.generateJWTAssertion();

      expect(assertion).toBe(mockJWT);
      expect(jwt.sign).toHaveBeenCalledWith(
        expect.objectContaining({
          iss: config.trueLayer.clientId,
          sub: config.trueLayer.clientId,
          aud: `${config.trueLayer.authUrl}${config.trueLayer.tokenEndpoint}`,
        }),
        expect.any(String),
        expect.objectContaining({
          algorithm: "ES512",
          header: { kid: config.trueLayer.kid },
        })
      );
    });

    it("should handle JWT generation errors", async () => {
      jwt.sign.mockImplementation(() => {
        throw new Error("JWT signing failed");
      });

      await expect(TrueLayerService.generateJWTAssertion()).rejects.toThrow(
        "Failed to generate JWT assertion"
      );
    });
  });

  describe("getAccessToken", () => {
    it("should successfully obtain an access token", async () => {
      const mockToken = "mock.access.token";
      const mockResponse = {
        data: { access_token: mockToken },
      };

      // Mock JWT assertion generation
      jwt.sign.mockReturnValue("mock.jwt.assertion");

      // Mock successful token request
      mockAxiosCreate.post.mockResolvedValue(mockResponse);

      const token = await TrueLayerService.getAccessToken();

      expect(token).toBe(mockToken);
      expect(mockAxiosCreate.post).toHaveBeenCalledWith(
        config.trueLayer.tokenEndpoint,
        expect.objectContaining({
          grant_type: "client_credentials",
          client_assertion_type:
            "urn:ietf:params:oauth:client-assertion-type:jwt-bearer",
        })
      );
    });

    it("should handle token request errors", async () => {
      mockAxiosCreate.post.mockRejectedValue(new Error("Token request failed"));

      await expect(TrueLayerService.getAccessToken()).rejects.toThrow(
        "Failed to obtain TrueLayer access token"
      );
    });
  });

  describe("makeAuthenticatedRequest", () => {
    const mockEndpoint = "/test-endpoint";
    const mockData = { test: "data" };
    const mockAccessToken = "mock.access.token";

    beforeEach(() => {
      // Mock getAccessToken to return our mock token
      jest
        .spyOn(TrueLayerService, "getAccessToken")
        .mockResolvedValue(mockAccessToken);
    });

    it("should make successful authenticated requests", async () => {
      const mockResponse = { data: { result: "success" } };
      mockAxiosCreate.mockResolvedValue(mockResponse);

      const result = await TrueLayerService.makeAuthenticatedRequest(
        "POST",
        mockEndpoint,
        mockData
      );

      expect(result).toEqual(mockResponse.data);
      expect(mockAxiosCreate).toHaveBeenCalledWith({
        method: "POST",
        url: mockEndpoint,
        data: mockData,
        headers: {
          Authorization: `Bearer ${mockAccessToken}`,
        },
      });
    });

    it("should handle request errors", async () => {
      mockAxiosCreate.mockRejectedValue(new Error("Request failed"));

      await expect(
        TrueLayerService.makeAuthenticatedRequest("GET", mockEndpoint)
      ).rejects.toThrow();
    });
  });

  describe("Error handling and retries", () => {
    it("should retry on 5xx errors", async () => {
      const error = {
        config: { _retry: 0 },
        response: { status: 500 },
      };

      // Mock the delay to speed up tests
      jest.spyOn(global, "setTimeout").mockImplementation((cb) => cb());

      await expect(TrueLayerService.handleApiError(error)).rejects.toThrow();

      // Should have attempted retries
      expect(error.config._retry).toBeGreaterThan(0);
    });

    it("should not retry on 4xx errors", async () => {
      const error = {
        config: { _retry: 0 },
        response: { status: 400 },
      };

      await expect(TrueLayerService.handleApiError(error)).rejects.toThrow();

      // Should not have attempted retries
      expect(error.config._retry).toBe(0);
    });

    it("should stop retrying after maximum attempts", async () => {
      const error = {
        config: { _retry: config.trueLayer.retryAttempts },
        response: { status: 500 },
      };

      await expect(TrueLayerService.handleApiError(error)).rejects.toThrow();

      // Should not increment retry counter beyond max
      expect(error.config._retry).toBe(config.trueLayer.retryAttempts);
    });
  });

  describe("Token Validation and Refresh", () => {
    it("should handle invalid token format", async () => {
      const user = {
        trueLayerAccessToken: "invalid_token",
        trueLayerRefreshToken: "invalid_refresh",
        trueLayerTokenExpiresAt: "invalid_date",
      };

      await expect(
        TrueLayerService.validateAndRefreshTokens(user)
      ).rejects.toThrow("Invalid token expiration date");
    });

    it("should handle missing tokens", async () => {
      const user = {
        trueLayerAccessToken: null,
        trueLayerRefreshToken: null,
      };

      await expect(
        TrueLayerService.validateAndRefreshTokens(user)
      ).rejects.toThrow("User not properly connected to TrueLayer");
    });

    it("should handle refresh token expiration", async () => {
      const user = {
        trueLayerAccessToken: "old_token",
        trueLayerRefreshToken: "expired_refresh",
        trueLayerTokenExpiresAt: new Date(Date.now() - 3600000),
      };

      mockAxiosCreate.post.mockRejectedValueOnce({
        response: {
          status: 401,
          data: { error: "refresh_token_expired" },
        },
      });

      await expect(
        TrueLayerService.validateAndRefreshTokens(user)
      ).rejects.toThrow(
        "TrueLayer connection expired. Please reconnect your account."
      );
    });
  });

  describe("Transaction Parameter Validation", () => {
    it("should validate date range order", () => {
      const options = {
        from: "2024-01-31",
        to: "2024-01-01",
      };

      expect(() => TrueLayerService.validateTransactionParams(options)).toThrow(
        "'from' date must be before 'to' date"
      );
    });

    it("should handle invalid limit values", () => {
      const options = {
        limit: 200,
      };

      expect(() => TrueLayerService.validateTransactionParams(options)).toThrow(
        "Limit must be between 1 and 100"
      );
    });

    it("should handle malformed date strings", () => {
      const options = {
        from: "2024/01/01",
      };

      expect(() => TrueLayerService.validateTransactionParams(options)).toThrow(
        "Invalid 'from' date format"
      );
    });
  });

  describe("API Error Handling", () => {
    it("should handle rate limiting", async () => {
      mockAxiosCreate.get.mockRejectedValueOnce({
        response: {
          status: 429,
          data: { error: "rate_limit_exceeded" },
        },
      });

      await expect(TrueLayerService.getAccounts("valid_token")).rejects.toThrow(
        "Failed to fetch accounts"
      );
    });

    it("should handle API maintenance", async () => {
      mockAxiosCreate.get.mockRejectedValueOnce({
        response: {
          status: 503,
          data: { error: "service_unavailable" },
        },
      });

      await expect(TrueLayerService.getAccounts("valid_token")).rejects.toThrow(
        "Failed to fetch accounts"
      );
    });

    it("should handle network timeouts", async () => {
      mockAxiosCreate.get.mockRejectedValueOnce({
        code: "ECONNABORTED",
        message: "timeout of 5000ms exceeded",
      });

      await expect(TrueLayerService.getAccounts("valid_token")).rejects.toThrow(
        "Failed to fetch accounts"
      );
    });

    it("should handle DNS resolution failures", async () => {
      mockAxiosCreate.get.mockRejectedValueOnce({
        code: "ENOTFOUND",
        message: "getaddrinfo ENOTFOUND api.truelayer.com",
      });

      await expect(TrueLayerService.getAccounts("valid_token")).rejects.toThrow(
        "Failed to fetch accounts"
      );
    });
  });

  describe("Data Sanitization", () => {
    it("should properly mask account numbers", () => {
      const rawAccount = {
        account_id: "acc_123",
        account_number: {
          number: "12345678",
          sort_code: "123456",
        },
      };

      const sanitized = TrueLayerService.sanitizeAccountData(rawAccount);
      expect(sanitized.accountNumber).toBe("****5678");
      expect(sanitized.sortCode).toBe("123456");
    });

    it("should handle missing account numbers", () => {
      const rawAccount = {
        account_id: "acc_123",
        account_number: null,
      };

      const sanitized = TrueLayerService.sanitizeAccountData(rawAccount);
      expect(sanitized.accountNumber).toBeNull();
    });

    it("should sanitize transaction data", () => {
      const rawTransaction = {
        transaction_id: "tx_123",
        amount: -50.0,
        currency: "GBP",
        description: "CONFIDENTIAL-1234",
        merchant_name: "MERCHANT-ID-5678",
      };

      const sanitized =
        TrueLayerService.sanitizeTransactionData(rawTransaction);
      expect(sanitized.description).toBe("CONFIDENTIAL-1234");
      expect(sanitized.merchantName).toBe("MERCHANT-ID-5678");
    });
  });

  describe("Retry Logic", () => {
    it("should respect maximum retry attempts", async () => {
      const error = {
        config: { _retry: config.trueLayer.retryAttempts },
        response: { status: 500 },
      };

      await expect(TrueLayerService.handleApiError(error)).rejects.toThrow();
      expect(error.config._retry).toBe(config.trueLayer.retryAttempts);
    });

    it("should implement exponential backoff", async () => {
      const delays = [];
      jest.spyOn(global, "setTimeout").mockImplementation((cb, delay) => {
        delays.push(delay);
        cb();
      });

      const error = {
        config: { _retry: 0 },
        response: { status: 500 },
      };

      await expect(TrueLayerService.handleApiError(error)).rejects.toThrow();

      expect(delays[1]).toBeGreaterThan(delays[0]);
      expect(delays[2]).toBeGreaterThan(delays[1]);
    });
  });
});
