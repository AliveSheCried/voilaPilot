const request = require("supertest");
const mongoose = require("mongoose");
const app = require("../../app");
const User = require("../../models/User");
const TokenBlacklist = require("../../models/TokenBlacklist");

describe("Error Handling Integration Tests", () => {
  beforeAll(async () => {
    await User.deleteMany({});
    await TokenBlacklist.deleteMany({});
  });

  afterAll(async () => {
    await mongoose.connection.close();
  });

  describe("Authentication Errors", () => {
    describe("Registration", () => {
      it("should handle duplicate email registration", async () => {
        // Create initial user
        await User.create({
          email: "test@example.com",
          password: "Password123!",
        });

        // Attempt to register with same email
        const response = await request(app).post("/api/v1/auth/register").send({
          email: "test@example.com",
          password: "Password123!",
          confirmPassword: "Password123!",
        });

        expect(response.status).toBe(400);
        expect(response.body).toEqual({
          success: false,
          error: "REGISTRATION_EMAIL_IN_USE",
          message: "Email already registered",
        });
      });

      it("should handle weak password", async () => {
        const response = await request(app).post("/api/v1/auth/register").send({
          email: "new@example.com",
          password: "weak",
          confirmPassword: "weak",
        });

        expect(response.status).toBe(400);
        expect(response.body).toEqual({
          success: false,
          error: "REGISTRATION_WEAK_PASSWORD",
          message: "Password does not meet requirements",
        });
      });

      it("should handle validation errors", async () => {
        const response = await request(app).post("/api/v1/auth/register").send({
          email: "invalid-email",
          password: "Password123!",
        });

        expect(response.status).toBe(400);
        expect(response.body).toEqual({
          success: false,
          error: "VALIDATION_ERROR",
          message: "Validation failed",
          details: expect.arrayContaining([
            expect.objectContaining({
              field: "email",
              message: expect.any(String),
            }),
          ]),
        });
      });
    });

    describe("Login", () => {
      beforeAll(async () => {
        await User.create({
          email: "login@example.com",
          password: "Password123!",
        });
      });

      it("should handle invalid credentials", async () => {
        const response = await request(app).post("/api/v1/auth/login").send({
          email: "login@example.com",
          password: "wrongpassword",
        });

        expect(response.status).toBe(401);
        expect(response.body).toEqual({
          success: false,
          error: "AUTH_INVALID_CREDENTIALS",
          message: "Invalid credentials",
        });
      });

      it("should handle non-existent user", async () => {
        const response = await request(app).post("/api/v1/auth/login").send({
          email: "nonexistent@example.com",
          password: "Password123!",
        });

        expect(response.status).toBe(401);
        expect(response.body).toEqual({
          success: false,
          error: "AUTH_INVALID_CREDENTIALS",
          message: "Invalid credentials",
        });
      });

      it("should handle rate limiting", async () => {
        // Make multiple login attempts
        const attempts = Array(6)
          .fill()
          .map(() =>
            request(app).post("/api/v1/auth/login").send({
              email: "login@example.com",
              password: "wrongpassword",
            })
          );

        const responses = await Promise.all(attempts);
        const rateLimitedResponse = responses[responses.length - 1];

        expect(rateLimitedResponse.status).toBe(429);
        expect(rateLimitedResponse.body).toEqual({
          success: false,
          error: "RATE_LIMIT_ERROR",
          message: expect.any(String),
        });
      });
    });

    describe("Token Handling", () => {
      let validToken;

      beforeAll(async () => {
        const user = await User.create({
          email: "token@example.com",
          password: "Password123!",
        });

        const loginResponse = await request(app)
          .post("/api/v1/auth/login")
          .send({
            email: "token@example.com",
            password: "Password123!",
          });

        validToken = loginResponse.body.data.tokens.accessToken;
      });

      it("should handle invalid token format", async () => {
        const response = await request(app)
          .get("/api/v1/auth/profile")
          .set("Authorization", "Bearer invalid-token");

        expect(response.status).toBe(401);
        expect(response.body).toEqual({
          success: false,
          error: "AUTH_TOKEN_INVALID",
          message: "Invalid token",
        });
      });

      it("should handle blacklisted token", async () => {
        // Blacklist the token
        await TokenBlacklist.create({ token: validToken });

        const response = await request(app)
          .get("/api/v1/auth/profile")
          .set("Authorization", `Bearer ${validToken}`);

        expect(response.status).toBe(401);
        expect(response.body).toEqual({
          success: false,
          error: "AUTH_TOKEN_BLACKLISTED",
          message: "Token has been blacklisted",
        });
      });

      it("should handle missing token", async () => {
        const response = await request(app).get("/api/v1/auth/profile");

        expect(response.status).toBe(401);
        expect(response.body).toEqual({
          success: false,
          error: "AUTH_GENERAL",
          message: "Authentication failed",
        });
      });
    });
  });

  describe("Authorization Errors", () => {
    let userToken;

    beforeAll(async () => {
      const user = await User.create({
        email: "user@example.com",
        password: "Password123!",
        role: "user",
      });

      const loginResponse = await request(app).post("/api/v1/auth/login").send({
        email: "user@example.com",
        password: "Password123!",
      });

      userToken = loginResponse.body.data.tokens.accessToken;
    });

    it("should handle unauthorized access to admin routes", async () => {
      const response = await request(app)
        .get("/api/v1/console/metrics")
        .set("Authorization", `Bearer ${userToken}`);

      expect(response.status).toBe(403);
      expect(response.body).toEqual({
        success: false,
        error: "AUTHORIZATION_ROLE_REQUIRED",
        message: expect.stringContaining("admin"),
      });
    });
  });

  describe("Validation Errors", () => {
    it("should handle invalid request body", async () => {
      const response = await request(app).post("/api/v1/auth/register").send({
        // Missing required fields
      });

      expect(response.status).toBe(400);
      expect(response.body).toEqual({
        success: false,
        error: "VALIDATION_ERROR",
        message: "Validation failed",
        details: expect.any(Array),
      });
    });

    it("should handle invalid query parameters", async () => {
      const response = await request(app)
        .get("/api/v1/console/metrics")
        .query({ startDate: "invalid-date" });

      expect(response.status).toBe(400);
      expect(response.body).toEqual({
        success: false,
        error: "VALIDATION_ERROR",
        message: "Validation failed",
        details: expect.any(Array),
      });
    });
  });
});
