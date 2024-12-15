const request = require("supertest");
const mongoose = require("mongoose");
const app = require("../../app");
const User = require("../../models/User");
const TrueLayerService = require("../../services/trueLayerService");

describe("TrueLayer Authentication Integration Tests", () => {
  let authToken;
  let testUser;

  beforeAll(async () => {
    testUser = await User.create({
      username: "testuser",
      email: "test@example.com",
      password: "password123",
    });

    const loginResponse = await request(app).post("/api/v1/auth/login").send({
      email: "test@example.com",
      password: "password123",
    });

    authToken = loginResponse.body.data.accessToken;
  });

  afterAll(async () => {
    await User.deleteMany({});
    await mongoose.connection.close();
  });

  describe("POST /api/v1/truelayer/connect", () => {
    it("should successfully exchange authorization code for tokens", async () => {
      const mockTokens = {
        access_token: "new_access_token",
        refresh_token: "new_refresh_token",
        expires_in: 3600,
      };

      jest
        .spyOn(TrueLayerService, "exchangeAuthorizationCode")
        .mockResolvedValueOnce(mockTokens);

      const response = await request(app)
        .post("/api/v1/truelayer/connect")
        .set("Authorization", `Bearer ${authToken}`)
        .send({ code: "valid_auth_code" });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        success: true,
        message: "TrueLayer connection successful",
        data: expect.objectContaining({
          isConnected: true,
          expiresAt: expect.any(String),
        }),
      });

      // Verify user was updated
      const updatedUser = await User.findById(testUser._id).select(
        "+trueLayerAccessToken +trueLayerRefreshToken"
      );
      expect(updatedUser.trueLayerConnected).toBe(true);
      expect(updatedUser.trueLayerAccessToken).toBe(mockTokens.access_token);
    });

    it("should handle missing authorization code", async () => {
      const response = await request(app)
        .post("/api/v1/truelayer/connect")
        .set("Authorization", `Bearer ${authToken}`)
        .send({});

      expect(response.status).toBe(400);
      expect(response.body).toEqual({
        success: false,
        error: "MISSING_AUTH_CODE",
        message: "Authorization code is required",
      });
    });

    it("should handle TrueLayer API errors during token exchange", async () => {
      jest
        .spyOn(TrueLayerService, "exchangeAuthorizationCode")
        .mockRejectedValueOnce({
          statusCode: 400,
          message: "Invalid authorization code",
          details: "The authorization code has expired",
        });

      const response = await request(app)
        .post("/api/v1/truelayer/connect")
        .set("Authorization", `Bearer ${authToken}`)
        .send({ code: "invalid_code" });

      expect(response.status).toBe(400);
      expect(response.body).toEqual({
        success: false,
        error: "TRUELAYER_EXCHANGE_FAILED",
        message: "Failed to connect to TrueLayer",
        details: "The authorization code has expired",
      });
    });

    it("should handle concurrent token updates", async () => {
      const mockTokens = {
        access_token: "new_access_token",
        refresh_token: "new_refresh_token",
        expires_in: 3600,
      };

      // Simulate concurrent updates by modifying version
      await User.findByIdAndUpdate(testUser._id, {
        $inc: { trueLayerTokenVersion: 1 },
      });

      jest
        .spyOn(TrueLayerService, "exchangeAuthorizationCode")
        .mockResolvedValueOnce(mockTokens);

      const response = await request(app)
        .post("/api/v1/truelayer/connect")
        .set("Authorization", `Bearer ${authToken}`)
        .send({ code: "valid_code" });

      expect(response.status).toBe(409);
      expect(response.body).toEqual({
        success: false,
        error: "TOKEN_UPDATE_FAILED",
        message: "Failed to update user tokens due to concurrent modification",
      });
    });

    it("should handle extremely long authorization codes", async () => {
      const longCode = "a".repeat(5000); // Extremely long code

      const response = await request(app)
        .post("/api/v1/truelayer/connect")
        .set("Authorization", `Bearer ${authToken}`)
        .send({ code: longCode });

      expect(response.status).toBe(400);
      expect(response.body).toEqual({
        success: false,
        error: "VALIDATION_ERROR",
        message: "Invalid authorization code format",
      });
    });

    it("should handle malformed authorization codes", async () => {
      const malformedCode = "invalid-chars-!@#$%^&*()";

      const response = await request(app)
        .post("/api/v1/truelayer/connect")
        .set("Authorization", `Bearer ${authToken}`)
        .send({ code: malformedCode });

      expect(response.status).toBe(400);
      expect(response.body).toEqual({
        success: false,
        error: "VALIDATION_ERROR",
        message: "Invalid authorization code format",
      });
    });

    it("should handle invalid client credentials", async () => {
      jest
        .spyOn(TrueLayerService, "exchangeAuthorizationCode")
        .mockRejectedValueOnce({
          statusCode: 401,
          message: "Invalid client credentials",
          details: "Client authentication failed",
        });

      const response = await request(app)
        .post("/api/v1/truelayer/connect")
        .set("Authorization", `Bearer ${authToken}`)
        .send({ code: "valid_code" });

      expect(response.status).toBe(401);
      expect(response.body).toEqual({
        success: false,
        error: "TRUELAYER_EXCHANGE_FAILED",
        message: "Failed to connect to TrueLayer",
        details: "Client authentication failed",
      });
    });

    it("should handle redirect URI mismatch", async () => {
      jest
        .spyOn(TrueLayerService, "exchangeAuthorizationCode")
        .mockRejectedValueOnce({
          statusCode: 400,
          message: "Invalid redirect URI",
          details: "Redirect URI mismatch",
        });

      const response = await request(app)
        .post("/api/v1/truelayer/connect")
        .set("Authorization", `Bearer ${authToken}`)
        .send({ code: "valid_code" });

      expect(response.status).toBe(400);
      expect(response.body).toEqual({
        success: false,
        error: "TRUELAYER_EXCHANGE_FAILED",
        message: "Failed to connect to TrueLayer",
        details: "Redirect URI mismatch",
      });
    });
  });

  describe("Token Refresh Scenarios", () => {
    beforeEach(async () => {
      // Reset user to connected state with expired token
      await User.findByIdAndUpdate(testUser._id, {
        trueLayerConnected: true,
        trueLayerAccessToken: "expired_token",
        trueLayerRefreshToken: "valid_refresh_token",
        trueLayerTokenExpiresAt: new Date(Date.now() - 3600000),
        trueLayerTokenVersion: 0,
      });
    });

    it("should automatically refresh expired tokens", async () => {
      const mockNewTokens = {
        access_token: "new_access_token",
        refresh_token: "new_refresh_token",
        expires_in: 3600,
      };

      jest
        .spyOn(TrueLayerService, "validateAndRefreshTokens")
        .mockResolvedValueOnce(mockNewTokens);

      jest
        .spyOn(TrueLayerService, "getAccounts")
        .mockResolvedValueOnce([{ id: "acc_123" }]);

      const response = await request(app)
        .get("/api/v1/truelayer/accounts")
        .set("Authorization", `Bearer ${authToken}`);

      expect(response.status).toBe(200);

      // Verify tokens were updated
      const updatedUser = await User.findById(testUser._id).select(
        "+trueLayerAccessToken +trueLayerRefreshToken"
      );
      expect(updatedUser.trueLayerAccessToken).toBe(mockNewTokens.access_token);
    });

    it("should handle refresh token expiration", async () => {
      jest
        .spyOn(TrueLayerService, "validateAndRefreshTokens")
        .mockRejectedValueOnce({
          statusCode: 401,
          message: "Refresh token expired",
        });

      const response = await request(app)
        .get("/api/v1/truelayer/accounts")
        .set("Authorization", `Bearer ${authToken}`);

      expect(response.status).toBe(401);
      expect(response.body).toEqual({
        success: false,
        error: "ACCOUNTS_FETCH_FAILED",
        message: "Failed to fetch accounts",
      });

      // Verify user's TrueLayer connection was marked as disconnected
      const updatedUser = await User.findById(testUser._id);
      expect(updatedUser.trueLayerConnected).toBe(false);
    });

    it("should handle invalid refresh tokens", async () => {
      jest
        .spyOn(TrueLayerService, "validateAndRefreshTokens")
        .mockRejectedValueOnce({
          statusCode: 400,
          message: "Invalid refresh token format",
        });

      const response = await request(app)
        .get("/api/v1/truelayer/accounts")
        .set("Authorization", `Bearer ${authToken}`);

      expect(response.status).toBe(400);
      expect(response.body).toEqual({
        success: false,
        error: "ACCOUNTS_FETCH_FAILED",
        message: "Failed to fetch accounts",
      });
    });

    it("should handle malformed tokens during refresh", async () => {
      const malformedTokens = generateTestTokens("malformed");

      jest
        .spyOn(TrueLayerService, "validateAndRefreshTokens")
        .mockResolvedValueOnce(malformedTokens);

      const response = await request(app)
        .get("/api/v1/truelayer/accounts")
        .set("Authorization", `Bearer ${authToken}`);

      expect(response.status).toBe(500);
      expect(response.body).toEqual({
        success: false,
        error: "TOKEN_UPDATE_FAILED",
        message: "Failed to update user tokens",
      });
    });
  });

  describe("Error Handling", () => {
    it("should handle network errors during token exchange", async () => {
      jest
        .spyOn(TrueLayerService, "exchangeAuthorizationCode")
        .mockRejectedValueOnce({
          code: "ECONNABORTED",
          message: "Request timeout",
        });

      const response = await request(app)
        .post("/api/v1/truelayer/connect")
        .set("Authorization", `Bearer ${authToken}`)
        .send({ code: "valid_code" });

      expect(response.status).toBe(500);
      expect(response.body).toEqual({
        success: false,
        error: "TRUELAYER_EXCHANGE_FAILED",
        message: "Failed to connect to TrueLayer",
      });
    });

    it("should handle rate limiting", async () => {
      jest
        .spyOn(TrueLayerService, "exchangeAuthorizationCode")
        .mockRejectedValueOnce({
          statusCode: 429,
          message: "Too many requests",
          details: "Rate limit exceeded",
        });

      const response = await request(app)
        .post("/api/v1/truelayer/connect")
        .set("Authorization", `Bearer ${authToken}`)
        .send({ code: "valid_code" });

      expect(response.status).toBe(429);
      expect(response.body).toEqual({
        success: false,
        error: "TRUELAYER_EXCHANGE_FAILED",
        message: "Failed to connect to TrueLayer",
        details: "Rate limit exceeded",
      });
    });

    it("should handle server errors during token exchange", async () => {
      jest
        .spyOn(TrueLayerService, "exchangeAuthorizationCode")
        .mockRejectedValueOnce({
          statusCode: 500,
          message: "Internal server error",
          details: "Database connection failed",
        });

      const response = await request(app)
        .post("/api/v1/truelayer/connect")
        .set("Authorization", `Bearer ${authToken}`)
        .send({ code: "valid_code" });

      expect(response.status).toBe(500);
      expect(response.body).toEqual({
        success: false,
        error: "TRUELAYER_EXCHANGE_FAILED",
        message: "Failed to connect to TrueLayer",
        details: "Database connection failed",
      });
    });

    it("should handle gateway timeouts", async () => {
      jest
        .spyOn(TrueLayerService, "exchangeAuthorizationCode")
        .mockRejectedValueOnce({
          statusCode: 504,
          message: "Gateway timeout",
          details: "Upstream service timeout",
        });

      const response = await request(app)
        .post("/api/v1/truelayer/connect")
        .set("Authorization", `Bearer ${authToken}`)
        .send({ code: "valid_code" });

      expect(response.status).toBe(504);
      expect(response.body).toEqual({
        success: false,
        error: "TRUELAYER_EXCHANGE_FAILED",
        message: "Failed to connect to TrueLayer",
        details: "Upstream service timeout",
      });
    });

    it("should handle concurrent token refresh attempts", async () => {
      // Set up a user with version conflicts
      await User.findByIdAndUpdate(testUser._id, {
        ...(
          await createTestUser(User, "versionConflict", { _id: testUser._id })
        )._doc,
      });

      const mockNewTokens = generateTestTokens("valid");

      jest
        .spyOn(TrueLayerService, "validateAndRefreshTokens")
        .mockResolvedValueOnce(mockNewTokens);

      const response = await request(app)
        .get("/api/v1/truelayer/accounts")
        .set("Authorization", `Bearer ${authToken}`);

      expect(response.status).toBe(409);
      expect(response.body).toEqual({
        success: false,
        error: "TOKEN_UPDATE_FAILED",
        message: "Failed to update user tokens due to concurrent modification",
      });
    });
  });
});
