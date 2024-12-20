const ApiKeyService = require("../../services/apiKeyService");
const { ApiKeyError } = require("../../utils/errors");

describe("ApiKeyService", () => {
  describe("generateKey", () => {
    it("should generate a valid API key", () => {
      const key = ApiKeyService.generateKey();
      expect(key).toMatch(/^vk_[a-zA-Z0-9]{32}$/);
    });

    it("should generate unique keys", () => {
      const keys = new Set();
      for (let i = 0; i < 100; i++) {
        keys.add(ApiKeyService.generateKey());
      }
      expect(keys.size).toBe(100);
    });
  });

  describe("hashKey", () => {
    it("should hash a key consistently", async () => {
      const key = ApiKeyService.generateKey();
      const hash1 = await ApiKeyService.hashKey(key);
      const hash2 = await ApiKeyService.hashKey(key);
      expect(hash1).toBe(hash2);
    });

    it("should generate different hashes for different keys", async () => {
      const key1 = ApiKeyService.generateKey();
      const key2 = ApiKeyService.generateKey();
      const hash1 = await ApiKeyService.hashKey(key1);
      const hash2 = await ApiKeyService.hashKey(key2);
      expect(hash1).not.toBe(hash2);
    });

    it("should throw error for invalid key format", async () => {
      await expect(ApiKeyService.hashKey("invalid_key")).rejects.toThrow(
        ApiKeyError
      );
    });
  });

  describe("verifyKey", () => {
    it("should verify a valid key hash", async () => {
      const key = ApiKeyService.generateKey();
      const hash = await ApiKeyService.hashKey(key);
      const isValid = await ApiKeyService.verifyKey(key, hash);
      expect(isValid).toBe(true);
    });

    it("should reject an invalid key", async () => {
      const key = ApiKeyService.generateKey();
      const hash = await ApiKeyService.hashKey(key);
      const isValid = await ApiKeyService.verifyKey("vk_invalid12345", hash);
      expect(isValid).toBe(false);
    });

    it("should reject a tampered hash", async () => {
      const key = ApiKeyService.generateKey();
      const hash = await ApiKeyService.hashKey(key);
      const isValid = await ApiKeyService.verifyKey(key, hash + "tampered");
      expect(isValid).toBe(false);
    });
  });

  describe("validateKeyFormat", () => {
    it("should validate correct key format", () => {
      const key = ApiKeyService.generateKey();
      expect(() => ApiKeyService.validateKeyFormat(key)).not.toThrow();
    });

    it("should reject invalid prefix", () => {
      expect(() =>
        ApiKeyService.validateKeyFormat("invalid_prefix_12345")
      ).toThrow(ApiKeyError);
    });

    it("should reject invalid length", () => {
      expect(() => ApiKeyService.validateKeyFormat("vk_short")).toThrow(
        ApiKeyError
      );
    });

    it("should reject invalid characters", () => {
      expect(() =>
        ApiKeyService.validateKeyFormat("vk_invalid!@#$%^&*()")
      ).toThrow(ApiKeyError);
    });
  });

  describe("trackDeletion", () => {
    it("should track key deletion metrics", async () => {
      const metrics = {
        userId: "user123",
        keyId: "key123",
        reason: "user_requested",
        keyAge: 86400000, // 1 day
        lastUsed: new Date(),
      };

      await expect(ApiKeyService.trackDeletion(metrics)).resolves.not.toThrow();
    });

    it("should handle missing optional fields", async () => {
      const metrics = {
        userId: "user123",
        keyId: "key123",
        reason: "user_requested",
      };

      await expect(ApiKeyService.trackDeletion(metrics)).resolves.not.toThrow();
    });
  });
});
