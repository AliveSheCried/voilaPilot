const request = require("supertest");
const mongoose = require("mongoose");
const app = require("../../app");
const User = require("../../models/User");
const TrueLayerService = require("../../services/trueLayerService");

describe("TrueLayer Integration Tests", () => {
  let authToken;
  let testUser;

  beforeAll(async () => {
    testUser = await createTestUser(User, "connected");
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

  describe("GET /api/v1/truelayer/accounts", () => {
    it("should properly sanitize and transform account data", async () => {
      const mockAccounts = generateTestAccountData(3);
      jest
        .spyOn(TrueLayerService, "getAccounts")
        .mockResolvedValueOnce(mockAccounts);

      const response = await request(app)
        .get("/api/v1/truelayer/accounts")
        .set("Authorization", `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.data).toHaveLength(3);

      // Verify account data structure and sanitization
      response.body.data.forEach((account, index) => {
        expect(account).toEqual({
          id: expect.stringMatching(/^acc_\d+$/),
          accountType: expect.stringMatching(/^[A-Z]+$/),
          displayName: expect.any(String),
          currency: expect.stringMatching(/^[A-Z]{3}$/),
          accountNumber: expect.stringMatching(/^\*{4}\d{4}$/),
          sortCode: expect.stringMatching(/^\d{6}$/),
          provider: {
            id: expect.stringMatching(/^provider_\d+$/),
            name: expect.any(String),
          },
          balance: {
            available: expect.any(Number),
            current: expect.any(Number),
            timestamp: expect.stringMatching(
              /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z$/
            ),
          },
        });
      });
    });

    it("should handle large number of accounts", async () => {
      const mockAccounts = generateTestAccountData(100);
      jest
        .spyOn(TrueLayerService, "getAccounts")
        .mockResolvedValueOnce(mockAccounts);

      const response = await request(app)
        .get("/api/v1/truelayer/accounts")
        .set("Authorization", `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.data).toHaveLength(100);
      expect(response.body.data[99].id).toBe("acc_100");
    });

    it("should handle empty account list", async () => {
      jest.spyOn(TrueLayerService, "getAccounts").mockResolvedValueOnce([]);

      const response = await request(app)
        .get("/api/v1/truelayer/accounts")
        .set("Authorization", `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        success: true,
        data: [],
      });
    });
  });

  describe("GET /api/v1/truelayer/transactions", () => {
    it("should properly sanitize and transform transaction data", async () => {
      const mockTransactions = generateTestTransactionData(3);
      jest
        .spyOn(TrueLayerService, "getTransactions")
        .mockResolvedValueOnce(mockTransactions);

      const response = await request(app)
        .get("/api/v1/truelayer/transactions")
        .set("Authorization", `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.data).toHaveLength(3);

      // Verify transaction data structure and sanitization
      response.body.data.forEach((transaction, index) => {
        expect(transaction).toEqual({
          id: expect.stringMatching(/^tx_\d+$/),
          timestamp: expect.stringMatching(
            /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z$/
          ),
          description: expect.any(String),
          amount: expect.any(Number),
          currency: expect.stringMatching(/^[A-Z]{3}$/),
          transactionType: expect.stringMatching(/^[A-Z]+$/),
          transactionCategory: expect.stringMatching(/^[A-Z]+$/),
          merchantName: expect.any(String),
          runningBalance: expect.any(Number),
          metadata: {
            provider: expect.any(String),
            category: expect.stringMatching(/^[A-Z]+$/),
          },
        });
      });
    });

    it("should handle pagination for large transaction sets", async () => {
      const mockTransactions = generateTestTransactionData(100);
      jest
        .spyOn(TrueLayerService, "getTransactions")
        .mockResolvedValueOnce(mockTransactions.slice(0, 50));

      const response = await request(app)
        .get("/api/v1/truelayer/transactions")
        .query({ limit: 50 })
        .set("Authorization", `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.data).toHaveLength(50);
      expect(response.body.data[0].id).toBe("tx_1");
      expect(response.body.data[49].id).toBe("tx_50");
    });

    it("should handle date range filtering", async () => {
      const mockTransactions = generateTestTransactionData(10);
      jest
        .spyOn(TrueLayerService, "getTransactions")
        .mockResolvedValueOnce(mockTransactions);

      const response = await request(app)
        .get("/api/v1/truelayer/transactions")
        .query({
          from: "2024-01-01",
          to: "2024-01-31",
        })
        .set("Authorization", `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(
        response.body.data.every((tx) => {
          const txDate = new Date(tx.timestamp);
          return (
            txDate >= new Date("2024-01-01") && txDate <= new Date("2024-01-31")
          );
        })
      ).toBe(true);
    });

    it("should handle account-specific transaction filtering", async () => {
      const mockTransactions = generateTestTransactionData(5);
      jest
        .spyOn(TrueLayerService, "getTransactions")
        .mockResolvedValueOnce(mockTransactions);

      const response = await request(app)
        .get("/api/v1/truelayer/accounts/acc_123/transactions")
        .set("Authorization", `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.data).toHaveLength(5);
    });

    it("should handle empty transaction list", async () => {
      jest.spyOn(TrueLayerService, "getTransactions").mockResolvedValueOnce([]);

      const response = await request(app)
        .get("/api/v1/truelayer/transactions")
        .set("Authorization", `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        success: true,
        data: [],
      });
    });
  });

  describe("Performance and Load Handling", () => {
    it("should handle concurrent requests", async () => {
      const mockAccounts = generateTestAccountData(5);
      jest
        .spyOn(TrueLayerService, "getAccounts")
        .mockResolvedValue(mockAccounts);

      const requests = Array(10)
        .fill()
        .map(() =>
          request(app)
            .get("/api/v1/truelayer/accounts")
            .set("Authorization", `Bearer ${authToken}`)
        );

      const responses = await Promise.all(requests);

      responses.forEach((response) => {
        expect(response.status).toBe(200);
        expect(response.body.data).toHaveLength(5);
      });
    });

    it("should handle large response payloads", async () => {
      const mockTransactions = generateTestTransactionData(1000);
      jest
        .spyOn(TrueLayerService, "getTransactions")
        .mockResolvedValueOnce(mockTransactions.slice(0, 100));

      const response = await request(app)
        .get("/api/v1/truelayer/transactions")
        .query({ limit: 100 })
        .set("Authorization", `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.data).toHaveLength(100);
      expect(response.body.data[99].id).toBe("tx_100");
    });
  });
});
