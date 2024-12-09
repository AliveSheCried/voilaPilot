const request = require("supertest");
const app = require("../index");
const User = require("../models/User");

describe("Auth Registration", () => {
  beforeEach(async () => {
    await User.deleteMany({});
  });

  it("should register a new user with valid input", async () => {
    const res = await request(app).post("/api/v1/auth/register").send({
      username: "testuser",
      email: "test@example.com",
      password: "Test1234!",
      confirmPassword: "Test1234!",
    });

    expect(res.status).toBe(201);
    expect(res.body.status).toBe("success");
  });

  it("should reject invalid input", async () => {
    const res = await request(app).post("/api/v1/auth/register").send({
      username: "t",
      email: "invalid-email",
      password: "weak",
      confirmPassword: "weak",
    });

    expect(res.status).toBe(400);
    expect(res.body.status).toBe("error");
  });

  it("should reject request with missing required fields", async () => {
    const res = await request(app).post("/api/v1/auth/register").send({
      username: "testuser",
      password: "Test1234!",
    });

    expect(res.status).toBe(400);
    expect(res.body.status).toBe("error");
    expect(res.body.errors).toContainEqual(
      expect.objectContaining({
        field: "email",
      })
    );
  });

  it("should reject invalid JSON payload", async () => {
    const res = await request(app)
      .post("/api/v1/auth/register")
      .set("Content-Type", "application/json")
      .send('{"invalid json"');

    expect(res.status).toBe(400);
    expect(res.body.status).toBe("error");
    expect(res.body.message).toContain("Invalid JSON");
  });

  it("should handle concurrent registration attempts with same email", async () => {
    const userData = {
      username: "testuser",
      email: "test@example.com",
      password: "Test1234!",
      confirmPassword: "Test1234!",
    };

    // Create multiple concurrent requests
    const requests = Array(3)
      .fill()
      .map(() => request(app).post("/api/v1/auth/register").send(userData));

    const results = await Promise.all(requests);

    // Only one request should succeed
    const successCount = results.filter((res) => res.status === 201).length;
    expect(successCount).toBe(1);

    // Others should fail with conflict status
    const failureCount = results.filter((res) => res.status === 409).length;
    expect(failureCount).toBe(2);
  });
});

describe("Auth Login", () => {
  beforeAll(async () => {
    // Create a test user
    await request(app).post("/api/v1/auth/register").send({
      username: "testuser",
      email: "test@example.com",
      password: "Test1234!",
      confirmPassword: "Test1234!",
    });
  });

  it("should login successfully with valid credentials", async () => {
    const res = await request(app).post("/api/v1/auth/login").send({
      email: "test@example.com",
      password: "Test1234!",
    });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("success");
    expect(res.body.data).toHaveProperty("token");
    expect(res.body.data.user).toHaveProperty("id");
  });

  it("should reject invalid credentials", async () => {
    const res = await request(app).post("/api/v1/auth/login").send({
      email: "test@example.com",
      password: "WrongPassword123!",
    });

    expect(res.status).toBe(401);
    expect(res.body.status).toBe("error");
  });

  it("should reject invalid email format", async () => {
    const res = await request(app).post("/api/v1/auth/login").send({
      email: "invalid-email",
      password: "Test1234!",
    });

    expect(res.status).toBe(400);
    expect(res.body.status).toBe("error");
  });

  it("should handle rate limiting", async () => {
    // Attempt multiple logins
    const attempts = Array(6)
      .fill()
      .map(() =>
        request(app).post("/api/v1/auth/login").send({
          email: "test@example.com",
          password: "WrongPassword123!",
        })
      );

    const results = await Promise.all(attempts);
    const tooManyRequests = results.some((res) => res.status === 429);
    expect(tooManyRequests).toBe(true);
  });
});

describe("Protected Routes", () => {
  let authToken;

  beforeAll(async () => {
    // Login and get token
    const loginRes = await request(app).post("/api/v1/auth/login").send({
      email: "test@example.com",
      password: "Test1234!",
    });
    authToken = loginRes.body.data.token;
  });

  it("should access protected route with valid JWT", async () => {
    const res = await request(app)
      .get("/api/v1/auth/profile")
      .set("Authorization", `Bearer ${authToken}`);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("success");
  });

  it("should reject access without JWT", async () => {
    const res = await request(app).get("/api/v1/auth/profile");

    expect(res.status).toBe(401);
  });

  it("should reject access with invalid JWT", async () => {
    const res = await request(app)
      .get("/api/v1/auth/profile")
      .set("Authorization", "Bearer invalid-token");

    expect(res.status).toBe(401);
  });
});

describe("Token Management", () => {
  let accessToken;
  let refreshToken;

  beforeAll(async () => {
    const loginRes = await request(app).post("/api/v1/auth/login").send({
      email: "test@example.com",
      password: "Test1234!",
    });

    accessToken = loginRes.body.data.accessToken;
    refreshToken = loginRes.body.data.refreshToken;
  });

  it("should reject expired access token", async () => {
    // Wait for token to expire (if using short expiration for testing)
    await new Promise((resolve) => setTimeout(resolve, 1000));

    const res = await request(app)
      .get("/api/v1/auth/profile")
      .set("Authorization", `Bearer ${accessToken}`);

    expect(res.status).toBe(401);
    expect(res.body.message).toContain("expired");
  });

  it("should refresh access token with valid refresh token", async () => {
    const res = await request(app)
      .post("/api/v1/auth/refresh")
      .send({ refreshToken });

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveProperty("accessToken");
    expect(res.body.data).toHaveProperty("refreshToken");
  });

  it("should blacklist token after logout", async () => {
    // First logout
    await request(app)
      .post("/api/v1/auth/logout")
      .set("Authorization", `Bearer ${accessToken}`);

    // Try to use the same token
    const res = await request(app)
      .get("/api/v1/auth/profile")
      .set("Authorization", `Bearer ${accessToken}`);

    expect(res.status).toBe(401);
    expect(res.body.message).toContain("revoked");
  });
});
