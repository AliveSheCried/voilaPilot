import bcrypt from "bcryptjs";
import crypto from "crypto";
import logger from "../config/logger.js";

// LRU Cache for key verification results
class LRUCache {
  constructor(capacity) {
    this.capacity = capacity;
    this.cache = new Map();
  }

  get(key) {
    if (!this.cache.has(key)) return undefined;
    const value = this.cache.get(key);
    this.cache.delete(key);
    this.cache.set(key, value);
    return value;
  }

  put(key, value) {
    if (this.cache.has(key)) {
      this.cache.delete(key);
    } else if (this.cache.size >= this.capacity) {
      this.cache.delete(this.cache.keys().next().value);
    }
    this.cache.set(key, value);
  }

  clear() {
    this.cache.clear();
  }
}

class ApiKeyService {
  static verificationCache = new LRUCache(1000); // Cache last 1000 verifications
  static keyBuffer = []; // Buffer for pre-generated keys
  static KEY_BUFFER_SIZE = 10;
  static isGeneratingKeys = false;

  /**
   * Initialize the key buffer
   * @private
   */
  static async _fillKeyBuffer() {
    if (this.isGeneratingKeys) return;
    this.isGeneratingKeys = true;

    try {
      while (this.keyBuffer.length < this.KEY_BUFFER_SIZE) {
        const buffer = crypto.randomBytes(32);
        const key = buffer
          .toString("base64")
          .replace(/\+/g, "-")
          .replace(/\//g, "_")
          .replace(/=+$/, "");
        this.keyBuffer.push(`vk_${key}`);
      }
    } catch (error) {
      logger.error("Failed to fill key buffer:", error);
    } finally {
      this.isGeneratingKeys = false;
    }
  }

  /**
   * Generate a secure random API key
   * @returns {string} Generated API key
   */
  static async generateKey() {
    try {
      // Refill buffer if running low
      if (this.keyBuffer.length < this.KEY_BUFFER_SIZE / 2) {
        this._fillKeyBuffer();
      }

      // Get key from buffer or generate new one if buffer is empty
      if (this.keyBuffer.length > 0) {
        return this.keyBuffer.pop();
      }

      // Fallback to direct generation if buffer is empty
      const buffer = crypto.randomBytes(32);
      const key = buffer
        .toString("base64")
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, "");

      return `vk_${key}`;
    } catch (error) {
      logger.error("Failed to generate API key:", error);
      throw new Error("Failed to generate API key");
    }
  }

  /**
   * Hash an API key for secure storage
   * @param {string} key - The API key to hash
   * @returns {Promise<string>} Hashed API key
   */
  static async hashKey(key) {
    try {
      const salt = await bcrypt.genSalt(10);
      return await bcrypt.hash(key, salt);
    } catch (error) {
      logger.error("Failed to hash API key:", error);
      throw new Error("Failed to hash API key");
    }
  }

  /**
   * Verify if a provided key matches its hash
   * @param {string} key - The API key to verify
   * @param {string} hashedKey - The stored hash to compare against
   * @returns {Promise<boolean>} Whether the key matches
   */
  static async verifyKey(key, hashedKey) {
    try {
      // Check cache first
      const cacheKey = `${key}:${hashedKey}`;
      const cachedResult = this.verificationCache.get(cacheKey);
      if (cachedResult !== undefined) {
        return cachedResult;
      }

      // Perform verification
      const result = await bcrypt.compare(key, hashedKey);

      // Cache the result
      this.verificationCache.put(cacheKey, result);

      return result;
    } catch (error) {
      logger.error("Failed to verify API key:", error);
      throw new Error("Failed to verify API key");
    }
  }

  /**
   * Validate API key format
   * @param {string} key - The API key to validate
   * @returns {boolean} Whether the key format is valid
   */
  static validateKeyFormat(key) {
    const keyRegex = /^vk_[A-Za-z0-9_-]{43}$/;
    return keyRegex.test(key);
  }

  /**
   * Format API key for display (mask most of the key)
   * @param {string} key - The API key to mask
   * @returns {string} Masked API key
   */
  static maskKey(key) {
    if (!key || typeof key !== "string") return "";
    const parts = key.split("_");
    if (parts.length !== 2) return "";

    const prefix = parts[0];
    const value = parts[1];
    return `${prefix}_${value.substring(0, 4)}${"*".repeat(35)}${value.slice(
      -4
    )}`;
  }

  /**
   * Clear the verification cache
   * Used for testing or when needed to free memory
   */
  static clearCache() {
    this.verificationCache.clear();
  }
}

// Initialize key buffer
ApiKeyService._fillKeyBuffer();

export default ApiKeyService;
