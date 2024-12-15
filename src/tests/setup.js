const mongoose = require("mongoose");
const { MongoMemoryServer } = require("mongodb-memory-server");
const logger = require("../config/logger");

let mongoServer;

// Suppress logging during tests
logger.transports.forEach((t) => (t.silent = true));

// Setup MongoDB Memory Server
beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  const mongoUri = mongoServer.getUri();
  await mongoose.connect(mongoUri);
});

// Clear database between tests
beforeEach(async () => {
  const collections = mongoose.connection.collections;
  for (const key in collections) {
    await collections[key].deleteMany();
  }
});

// Cleanup after tests
afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

// Global test timeout
jest.setTimeout(10000);

// Mock crypto for consistent UUID generation
global.crypto = {
  randomUUID: jest.fn().mockReturnValue("test-uuid"),
};

// Mock Date.now for consistent timestamps
const mockNow = new Date("2024-01-01T00:00:00.000Z").getTime();
global.Date.now = jest.fn(() => mockNow);

// Helper function to create test users with TrueLayer scenarios
global.createTestUser = async (User, scenario = "default", overrides = {}) => {
  const baseUser = {
    username: "testuser",
    email: "test@example.com",
    password: "password123",
    trueLayerConnected: false,
  };

  const scenarios = {
    default: {},
    connected: {
      trueLayerConnected: true,
      trueLayerAccessToken: "valid_access_token",
      trueLayerRefreshToken: "valid_refresh_token",
      trueLayerTokenExpiresAt: new Date(Date.now() + 3600000),
      trueLayerTokenVersion: 0,
    },
    expiredToken: {
      trueLayerConnected: true,
      trueLayerAccessToken: "expired_access_token",
      trueLayerRefreshToken: "valid_refresh_token",
      trueLayerTokenExpiresAt: new Date(Date.now() - 3600000),
      trueLayerTokenVersion: 0,
    },
    expiredRefreshToken: {
      trueLayerConnected: true,
      trueLayerAccessToken: "expired_access_token",
      trueLayerRefreshToken: "expired_refresh_token",
      trueLayerTokenExpiresAt: new Date(Date.now() - 3600000),
      trueLayerTokenVersion: 0,
    },
    disconnected: {
      trueLayerConnected: false,
      trueLayerAccessToken: null,
      trueLayerRefreshToken: null,
      trueLayerTokenExpiresAt: null,
      trueLayerTokenVersion: 0,
    },
    versionConflict: {
      trueLayerConnected: true,
      trueLayerAccessToken: "valid_access_token",
      trueLayerRefreshToken: "valid_refresh_token",
      trueLayerTokenExpiresAt: new Date(Date.now() + 3600000),
      trueLayerTokenVersion: 5, // High version number to simulate conflicts
    },
  };

  return await User.create({
    ...baseUser,
    ...scenarios[scenario],
    ...overrides,
  });
};

// Helper function to generate test tokens
global.generateTestTokens = (scenario = "valid") => {
  const tokens = {
    valid: {
      access_token: "test_access_token",
      refresh_token: "test_refresh_token",
      expires_in: 3600,
    },
    expired: {
      access_token: "expired_access_token",
      refresh_token: "expired_refresh_token",
      expires_in: -3600,
    },
    shortLived: {
      access_token: "short_lived_token",
      refresh_token: "test_refresh_token",
      expires_in: 300, // 5 minutes
    },
    malformed: {
      access_token: "a".repeat(1000), // Extremely long token
      refresh_token: "invalid-format-token",
      expires_in: "invalid",
    },
  };

  return tokens[scenario];
};

// Helper function to generate test account data
global.generateTestAccountData = (count = 1) => {
  return Array.from({ length: count }, (_, i) => ({
    account_id: `acc_${i + 1}`,
    account_type: "CURRENT",
    display_name: `Test Account ${i + 1}`,
    currency: "GBP",
    account_number: {
      number: `1234567${i}`,
      sort_code: "123456",
    },
    provider: {
      provider_id: `provider_${i + 1}`,
      display_name: `Test Bank ${i + 1}`,
    },
    balance: 1000.0 + i,
    update_timestamp: new Date().toISOString(),
  }));
};

// Helper function to generate test transaction data
global.generateTestTransactionData = (count = 1) => {
  return Array.from({ length: count }, (_, i) => ({
    transaction_id: `tx_${i + 1}`,
    timestamp: new Date(Date.now() - i * 86400000).toISOString(), // Each transaction 1 day apart
    description: `Test Transaction ${i + 1}`,
    amount: -50.0 - i,
    currency: "GBP",
    transaction_type: "DEBIT",
    transaction_category: "PURCHASE",
    merchant_name: `Test Merchant ${i + 1}`,
    running_balance: 1000.0 - 50.0 * (i + 1),
    provider: {
      provider_id: "test_bank",
      display_name: "Test Bank",
    },
    transaction_classification: ["SHOPPING", "RETAIL"],
  }));
};
