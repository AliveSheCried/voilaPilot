const {
  validateTransactionParams,
  validateApiVersion,
} = require("../../middleware/trueLayerValidation");

describe("TrueLayer Validation Middleware", () => {
  let mockReq;
  let mockRes;
  let nextFunction;

  beforeEach(() => {
    mockReq = {
      query: {},
      params: {},
      path: "/api/v1/truelayer/transactions",
    };
    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
    nextFunction = jest.fn();
  });

  describe("validateTransactionParams", () => {
    it("should pass valid date parameters", async () => {
      mockReq.query = {
        from: "2024-01-01",
        to: "2024-01-31",
        limit: "50",
      };

      // Execute all middleware functions in the array
      for (const middleware of validateTransactionParams) {
        await middleware(mockReq, mockRes, nextFunction);
      }

      expect(nextFunction).toHaveBeenCalled();
      expect(mockRes.status).not.toHaveBeenCalled();
    });

    it("should reject invalid date format", async () => {
      mockReq.query = {
        from: "01-01-2024", // Invalid format
      };

      for (const middleware of validateTransactionParams) {
        await middleware(mockReq, mockRes, nextFunction);
      }

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: "VALIDATION_ERROR",
        })
      );
    });

    it("should reject invalid limit value", async () => {
      mockReq.query = {
        limit: "200", // Exceeds maximum
      };

      for (const middleware of validateTransactionParams) {
        await middleware(mockReq, mockRes, nextFunction);
      }

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: "VALIDATION_ERROR",
          details: expect.arrayContaining([
            expect.objectContaining({
              field: "limit",
            }),
          ]),
        })
      );
    });

    it("should validate accountId when present", async () => {
      mockReq.params = {
        accountId: "", // Empty string
      };

      for (const middleware of validateTransactionParams) {
        await middleware(mockReq, mockRes, nextFunction);
      }

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: "VALIDATION_ERROR",
          details: expect.arrayContaining([
            expect.objectContaining({
              field: "accountId",
            }),
          ]),
        })
      );
    });
  });

  describe("validateApiVersion", () => {
    it("should pass valid API version", () => {
      mockReq.path = "/api/v1/truelayer/accounts";

      validateApiVersion(mockReq, mockRes, nextFunction);

      expect(nextFunction).toHaveBeenCalled();
      expect(mockRes.status).not.toHaveBeenCalled();
    });

    it("should reject invalid API version", () => {
      mockReq.path = "/api/v2/truelayer/accounts";

      validateApiVersion(mockReq, mockRes, nextFunction);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: "INVALID_API_VERSION",
        })
      );
    });

    it("should handle malformed paths", () => {
      mockReq.path = "/invalid/path";

      validateApiVersion(mockReq, mockRes, nextFunction);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: "INVALID_API_VERSION",
        })
      );
    });
  });
});
