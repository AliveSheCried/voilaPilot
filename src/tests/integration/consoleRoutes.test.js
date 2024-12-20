const request = require("supertest");
const mongoose = require("mongoose");
const app = require("../../app");
const User = require("../../models/User");
const { generateTestToken } = require("../testUtils");

describe("Console Routes", () => {
  let testUser;
  let adminUser;
  let userToken;
  let adminToken;
  let testApiKey;

  beforeAll(async () => {
    // Create test users
    testUser = await User.create({
      email: "test@example.com",
      password: "password123",
      role: "user",
    });

    adminUser = await User.create({
      email: "admin@example.com",
      password: "password123",
      role: "admin",
    });

    userToken = generateTestToken(testUser);
    adminToken = generateTestToken(adminUser);
  });

  afterAll(async () => {
    await User.deleteMany({});
    await mongoose.connection.close();
  });

  describe("GET /api/v1/console/keys", () => {
    it("should return user API keys", async () => {
      const response = await request(app)
        .get("/api/v1/console/keys")
        .set("Authorization", `Bearer ${userToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.data)).toBe(true);
    });

    it("should require authentication", async () => {
      const response = await request(app).get("/api/v1/console/keys");

      expect(response.status).toBe(401);
      expect(response.body.error).toBe("AUTHENTICATION_ERROR");
    });

    it("should handle invalid token", async () => {
      const response = await request(app)
        .get("/api/v1/console/keys")
        .set("Authorization", "Bearer invalid_token");

      expect(response.status).toBe(401);
      expect(response.body.error).toBe("AUTHENTICATION_ERROR");
    });
  });

  describe("POST /api/v1/console/keys", () => {
    it("should create a new API key", async () => {
      const response = await request(app)
        .post("/api/v1/console/keys")
        .set("Authorization", `Bearer ${userToken}`)
        .send({
          name: "Test API Key",
          expiresIn: 90,
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data.key).toMatch(/^vk_[a-zA-Z0-9]{32}$/);

      testApiKey = response.body.data.id;
    });

    it("should validate key name", async () => {
      const response = await request(app)
        .post("/api/v1/console/keys")
        .set("Authorization", `Bearer ${userToken}`)
        .send({
          name: "a", // Too short
          expiresIn: 90,
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe("VALIDATION_ERROR");
    });

    it("should enforce key limit", async () => {
      // Create keys up to limit
      for (let i = 0; i < 4; i++) {
        await request(app)
          .post("/api/v1/console/keys")
          .set("Authorization", `Bearer ${userToken}`)
          .send({
            name: `Test Key ${i}`,
            expiresIn: 90,
          });
      }

      // Try to exceed limit
      const response = await request(app)
        .post("/api/v1/console/keys")
        .set("Authorization", `Bearer ${userToken}`)
        .send({
          name: "Excess Key",
          expiresIn: 90,
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe("KEY_LIMIT_REACHED");
    });
  });

  describe("DELETE /api/v1/console/keys/:keyId", () => {
    it("should delete an API key", async () => {
      const response = await request(app)
        .delete(`/api/v1/console/keys/${testApiKey}`)
        .set("Authorization", `Bearer ${userToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.deletedKey.id).toBe(testApiKey);
    });

    it("should handle nonexistent key", async () => {
      const response = await request(app)
        .delete("/api/v1/console/keys/nonexistent_id")
        .set("Authorization", `Bearer ${userToken}`);

      expect(response.status).toBe(404);
      expect(response.body.error).toBe("API_KEY_NOT_FOUND");
    });

    it("should prevent unauthorized deletion", async () => {
      // Create a key for admin user
      const createResponse = await request(app)
        .post("/api/v1/console/keys")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          name: "Admin Key",
          expiresIn: 90,
        });

      const adminKeyId = createResponse.body.data.id;

      // Try to delete admin's key with user token
      const response = await request(app)
        .delete(`/api/v1/console/keys/${adminKeyId}`)
        .set("Authorization", `Bearer ${userToken}`);

      expect(response.status).toBe(404);
      expect(response.body.error).toBe("API_KEY_NOT_FOUND");
    });
  });

  describe("Rate Limiting", () => {
    it("should enforce rate limits", async () => {
      const requests = Array(101)
        .fill()
        .map(() =>
          request(app)
            .get("/api/v1/console/keys")
            .set("Authorization", `Bearer ${userToken}`)
        );

      const responses = await Promise.all(requests);
      const rateLimited = responses.some((r) => r.status === 429);
      expect(rateLimited).toBe(true);
    });
  });

  describe("Cache Behavior", () => {
    it("should cache GET requests", async () => {
      // First request
      const response1 = await request(app)
        .get("/api/v1/console/keys")
        .set("Authorization", `Bearer ${userToken}`);

      // Second request should be cached
      const response2 = await request(app)
        .get("/api/v1/console/keys")
        .set("Authorization", `Bearer ${userToken}`);

      expect(response1.body).toEqual(response2.body);
    });

    it("should bypass cache when requested", async () => {
      const response = await request(app)
        .get("/api/v1/console/keys?bypass_cache=true")
        .set("Authorization", `Bearer ${userToken}`);

      expect(response.status).toBe(200);
    });
  });

  describe("Error Handling", () => {
    it("should handle invalid key ID format", async () => {
      const response = await request(app)
        .delete("/api/v1/console/keys/invalid_format")
        .set("Authorization", `Bearer ${userToken}`);

      expect(response.status).toBe(400);
      expect(response.body.error).toBe("VALIDATION_ERROR");
    });

    it("should handle database errors gracefully", async () => {
      // Temporarily break the database connection
      await mongoose.connection.close();

      const response = await request(app)
        .get("/api/v1/console/keys")
        .set("Authorization", `Bearer ${userToken}`);

      expect(response.status).toBe(500);
      expect(response.body.error).toBe("INTERNAL_ERROR");

      // Restore connection for other tests
      await mongoose.connect(process.env.MONGODB_URI);
    });
  });
});
