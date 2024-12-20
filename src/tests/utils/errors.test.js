const {
  AppError,
  AuthenticationError,
  RegistrationError,
  TrueLayerError,
  ValidationError,
  AuthorizationError,
  ResourceNotFoundError,
  DatabaseError,
} = require("../../utils/errors");

describe("Error Classes", () => {
  describe("AppError", () => {
    it("should create base error with correct properties", () => {
      const error = new AppError("Test error", 400, "TEST_ERROR");

      expect(error).toBeInstanceOf(Error);
      expect(error.statusCode).toBe(400);
      expect(error.errorCode).toBe("TEST_ERROR");
      expect(error.status).toBe("fail");
      expect(error.isOperational).toBe(true);
      expect(error.timestamp).toBeDefined();
      expect(error.stack).toBeDefined();
    });
  });

  describe("AuthenticationError", () => {
    it("should create authentication error with default values", () => {
      const error = new AuthenticationError();

      expect(error).toBeInstanceOf(AppError);
      expect(error.statusCode).toBe(401);
      expect(error.errorCode).toBe("AUTH_GENERAL");
      expect(error.message).toBe("Authentication failed");
    });

    it("should create credentials invalid error", () => {
      const error = AuthenticationError.credentialsInvalid();

      expect(error.statusCode).toBe(401);
      expect(error.errorCode).toBe("AUTH_INVALID_CREDENTIALS");
      expect(error.message).toBe("Invalid credentials");
    });

    it("should create token expired error", () => {
      const error = AuthenticationError.tokenExpired();

      expect(error.statusCode).toBe(401);
      expect(error.errorCode).toBe("AUTH_TOKEN_EXPIRED");
      expect(error.message).toBe("Token has expired");
    });

    it("should create token invalid error", () => {
      const error = AuthenticationError.tokenInvalid();

      expect(error.statusCode).toBe(401);
      expect(error.errorCode).toBe("AUTH_TOKEN_INVALID");
      expect(error.message).toBe("Invalid token");
    });
  });

  describe("RegistrationError", () => {
    it("should create registration error with default values", () => {
      const error = new RegistrationError("Registration failed");

      expect(error).toBeInstanceOf(AppError);
      expect(error.statusCode).toBe(400);
      expect(error.errorCode).toBe("REGISTRATION_GENERAL");
    });

    it("should create email in use error", () => {
      const error = RegistrationError.emailInUse();

      expect(error.statusCode).toBe(400);
      expect(error.errorCode).toBe("REGISTRATION_EMAIL_IN_USE");
      expect(error.message).toBe("Email already registered");
    });

    it("should create weak password error", () => {
      const error = RegistrationError.passwordWeak();

      expect(error.statusCode).toBe(400);
      expect(error.errorCode).toBe("REGISTRATION_WEAK_PASSWORD");
      expect(error.message).toBe("Password does not meet requirements");
    });
  });

  describe("TrueLayerError", () => {
    it("should create TrueLayer error with details", () => {
      const details = { requestId: "123" };
      const error = new TrueLayerError("API error", 500, "API_ERROR", details);

      expect(error).toBeInstanceOf(AppError);
      expect(error.statusCode).toBe(500);
      expect(error.errorCode).toBe("TRUELAYER_API_ERROR");
      expect(error.source).toBe("TrueLayer");
      expect(error.details).toEqual(details);
    });

    it("should create authentication failed error", () => {
      const error = TrueLayerError.authenticationFailed();

      expect(error.statusCode).toBe(401);
      expect(error.errorCode).toBe("TRUELAYER_AUTH_FAILED");
      expect(error.source).toBe("TrueLayer");
    });

    it("should create rate limit error", () => {
      const error = TrueLayerError.rateLimit();

      expect(error.statusCode).toBe(429);
      expect(error.errorCode).toBe("TRUELAYER_RATE_LIMIT");
      expect(error.source).toBe("TrueLayer");
    });
  });

  describe("ValidationError", () => {
    it("should create validation error with details", () => {
      const details = [{ field: "email", message: "Invalid email" }];
      const error = new ValidationError("Validation failed", details);

      expect(error).toBeInstanceOf(AppError);
      expect(error.statusCode).toBe(400);
      expect(error.errorCode).toBe("VALIDATION_ERROR");
      expect(error.details).toEqual(details);
    });
  });

  describe("AuthorizationError", () => {
    it("should create authorization error with default values", () => {
      const error = new AuthorizationError();

      expect(error).toBeInstanceOf(AppError);
      expect(error.statusCode).toBe(403);
      expect(error.errorCode).toBe("AUTHORIZATION_GENERAL");
    });

    it("should create role required error", () => {
      const error = AuthorizationError.roleRequired("admin");

      expect(error.statusCode).toBe(403);
      expect(error.errorCode).toBe("AUTHORIZATION_ROLE_REQUIRED");
      expect(error.message).toBe("Role admin required");
    });
  });

  describe("DatabaseError", () => {
    it("should create database error with operation details", () => {
      const error = new DatabaseError("Query failed", "QUERY", {
        collection: "users",
      });

      expect(error).toBeInstanceOf(AppError);
      expect(error.statusCode).toBe(500);
      expect(error.errorCode).toBe("DATABASE_QUERY");
      expect(error.operation).toBe("QUERY");
      expect(error.details).toEqual({ collection: "users" });
    });

    it("should create connection failed error", () => {
      const error = DatabaseError.connectionFailed();

      expect(error.statusCode).toBe(500);
      expect(error.errorCode).toBe("DATABASE_CONNECTION_FAILED");
      expect(error.message).toBe("Database connection failed");
    });
  });
});

describe("Error Handler Middleware", () => {
  let mockRequest;
  let mockResponse;
  let nextFunction;
  let globalErrorHandler;

  beforeEach(() => {
    mockRequest = {
      path: "/test",
      method: "GET",
      correlationId: "123",
      headers: {
        "user-agent": "test-agent",
      },
      ip: "127.0.0.1",
    };

    mockResponse = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };

    nextFunction = jest.fn();

    // Re-import to get fresh instance
    jest.isolateModules(() => {
      ({ globalErrorHandler } = require("../../utils/errors"));
    });
  });

  it("should handle operational errors", () => {
    const error = new AppError("Test error", 400, "TEST_ERROR");

    globalErrorHandler(error, mockRequest, mockResponse, nextFunction);

    expect(mockResponse.status).toHaveBeenCalledWith(400);
    expect(mockResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: "TEST_ERROR",
        message: "Test error",
      })
    );
  });

  it("should handle validation errors", () => {
    const error = new ValidationError("Validation failed", [
      { field: "email", message: "Invalid email" },
    ]);

    globalErrorHandler(error, mockRequest, mockResponse, nextFunction);

    expect(mockResponse.status).toHaveBeenCalledWith(400);
    expect(mockResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: "VALIDATION_ERROR",
        details: expect.any(Array),
      })
    );
  });

  it("should handle non-operational errors in production", () => {
    process.env.NODE_ENV = "production";
    const error = new Error("System error");

    globalErrorHandler(error, mockRequest, mockResponse, nextFunction);

    expect(mockResponse.status).toHaveBeenCalledWith(500);
    expect(mockResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: "INTERNAL_ERROR",
        message: "Internal server error",
      })
    );
  });

  it("should include stack trace in development", () => {
    process.env.NODE_ENV = "development";
    const error = new AppError("Test error", 400, "TEST_ERROR");

    globalErrorHandler(error, mockRequest, mockResponse, nextFunction);

    expect(mockResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({
        stack: expect.any(String),
        timestamp: expect.any(String),
      })
    );
  });

  it("should handle MongoDB duplicate key errors", () => {
    const mongoError = {
      name: "MongoError",
      code: 11000,
      keyPattern: { email: 1 },
    };

    globalErrorHandler(mongoError, mockRequest, mockResponse, nextFunction);

    expect(mockResponse.status).toHaveBeenCalledWith(500);
    expect(mockResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: "DATABASE_DUPLICATE_KEY",
        details: expect.objectContaining({
          field: "email",
        }),
      })
    );
  });
});
