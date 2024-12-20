const logger = require("../config/logger");

class CacheService {
  constructor(options = {}) {
    this.cache = new Map();
    this.defaultTTL = options.defaultTTL || 60000; // 1 minute default TTL
    this.maxSize = options.maxSize || 1000; // Maximum number of items to store
    this.cleanupInterval = options.cleanupInterval || 300000; // 5 minutes

    // Start cleanup interval
    this.startCleanup();
  }

  /**
   * Get a value from cache
   * @param {string} key - Cache key
   * @returns {*} Cached value or undefined
   */
  get(key) {
    const item = this.cache.get(key);
    if (!item) return undefined;

    if (Date.now() > item.expiresAt) {
      this.cache.delete(key);
      return undefined;
    }

    return item.value;
  }

  /**
   * Set a value in cache
   * @param {string} key - Cache key
   * @param {*} value - Value to cache
   * @param {number} ttl - Time to live in seconds
   */
  set(key, value, ttl = this.defaultTTL / 1000) {
    // Check cache size before adding
    if (this.cache.size >= this.maxSize) {
      this.removeOldest();
    }

    this.cache.set(key, {
      value,
      expiresAt: Date.now() + ttl * 1000,
      createdAt: Date.now(),
    });

    logger.debug("Cache item set", {
      key,
      ttl: `${ttl}s`,
      cacheSize: this.cache.size,
    });
  }

  /**
   * Remove a value from cache
   * @param {string} key - Cache key
   */
  delete(key) {
    this.cache.delete(key);
  }

  /**
   * Clear all cached values
   */
  clear() {
    this.cache.clear();
    logger.info("Cache cleared");
  }

  /**
   * Remove oldest cache entries
   * @private
   */
  removeOldest() {
    const entries = Array.from(this.cache.entries()).sort(
      (a, b) => a[1].createdAt - b[1].createdAt
    );

    // Remove 10% of oldest entries
    const removeCount = Math.ceil(this.maxSize * 0.1);
    entries.slice(0, removeCount).forEach(([key]) => {
      this.cache.delete(key);
    });

    logger.debug("Removed oldest cache entries", {
      removedCount: removeCount,
      newSize: this.cache.size,
    });
  }

  /**
   * Start cleanup interval
   * @private
   */
  startCleanup() {
    setInterval(() => {
      const now = Date.now();
      let expiredCount = 0;

      for (const [key, item] of this.cache.entries()) {
        if (now > item.expiresAt) {
          this.cache.delete(key);
          expiredCount++;
        }
      }

      if (expiredCount > 0) {
        logger.debug("Cache cleanup completed", {
          expiredRemoved: expiredCount,
          remainingItems: this.cache.size,
        });
      }
    }, this.cleanupInterval);
  }

  /**
   * Get cache statistics
   * @returns {Object} Cache statistics
   */
  getStats() {
    const now = Date.now();
    const stats = {
      size: this.cache.size,
      maxSize: this.maxSize,
      expired: 0,
      valid: 0,
    };

    for (const item of this.cache.values()) {
      if (now > item.expiresAt) {
        stats.expired++;
      } else {
        stats.valid++;
      }
    }

    return stats;
  }
}

// Create singleton instance
const cache = new CacheService({
  defaultTTL: process.env.CACHE_TTL || 60000,
  maxSize: process.env.CACHE_MAX_SIZE || 1000,
  cleanupInterval: process.env.CACHE_CLEANUP_INTERVAL || 300000,
});

module.exports = cache;
