import Redis from "ioredis";
import LRU from "lru-cache";
import logger from "../config/logger.js";

// Redis client for distributed caching
const redisClient = new Redis(
  process.env.REDIS_URL || "redis://localhost:6379"
);

// In-memory LRU cache for frequently accessed data
const lruCache = new LRU({
  max: 1000, // Maximum number of items
  maxAge: 1000 * 60 * 60, // Items expire after 1 hour
  updateAgeOnGet: true, // Update item age on access
});

// Metrics for cache performance
const metrics = {
  hits: 0,
  misses: 0,
  errors: 0,
  lastReset: Date.now(),
};

/**
 * Reset cache metrics
 * @private
 */
const resetMetrics = () => {
  metrics.hits = 0;
  metrics.misses = 0;
  metrics.errors = 0;
  metrics.lastReset = Date.now();
};

// Reset metrics every hour
setInterval(resetMetrics, 60 * 60 * 1000);

/**
 * Get cache metrics
 * @returns {Object} Current cache metrics
 */
const getMetrics = () => {
  const total = metrics.hits + metrics.misses;
  return {
    hits: metrics.hits,
    misses: metrics.misses,
    errors: metrics.errors,
    hitRate: total > 0 ? (metrics.hits / total) * 100 : 0,
    totalRequests: total,
    sinceTimestamp: metrics.lastReset,
  };
};

/**
 * Generate cache key
 * @private
 * @param {string} namespace - Cache namespace
 * @param {string} key - Cache key
 * @returns {string} Full cache key
 */
const getCacheKey = (namespace, key) => `cache:${namespace}:${key}`;

/**
 * Get item from cache
 * @param {string} namespace - Cache namespace
 * @param {string} key - Cache key
 * @param {Object} options - Cache options
 * @returns {Promise<*>} Cached value or null
 */
const get = async (namespace, key, options = {}) => {
  const fullKey = getCacheKey(namespace, key);

  try {
    // Try LRU cache first
    const localValue = lruCache.get(fullKey);
    if (localValue !== undefined) {
      metrics.hits++;
      return JSON.parse(localValue);
    }

    // Try Redis
    const redisValue = await redisClient.get(fullKey);
    if (redisValue) {
      // Update LRU cache
      lruCache.set(fullKey, redisValue);
      metrics.hits++;
      return JSON.parse(redisValue);
    }

    metrics.misses++;
    return null;
  } catch (error) {
    metrics.errors++;
    logger.error("Cache get error", {
      error: error.message,
      namespace,
      key,
    });
    return null;
  }
};

/**
 * Set item in cache
 * @param {string} namespace - Cache namespace
 * @param {string} key - Cache key
 * @param {*} value - Value to cache
 * @param {Object} options - Cache options
 * @returns {Promise<boolean>} Success status
 */
const set = async (namespace, key, value, options = {}) => {
  const fullKey = getCacheKey(namespace, key);
  const stringValue = JSON.stringify(value);

  try {
    // Set in Redis
    await redisClient.set(
      fullKey,
      stringValue,
      "EX",
      options.ttl || 3600 // Default 1 hour TTL
    );

    // Update LRU cache
    lruCache.set(fullKey, stringValue);

    return true;
  } catch (error) {
    metrics.errors++;
    logger.error("Cache set error", {
      error: error.message,
      namespace,
      key,
    });
    return false;
  }
};

/**
 * Delete item from cache
 * @param {string} namespace - Cache namespace
 * @param {string} key - Cache key
 * @returns {Promise<boolean>} Success status
 */
const del = async (namespace, key) => {
  const fullKey = getCacheKey(namespace, key);

  try {
    // Delete from Redis
    await redisClient.del(fullKey);

    // Delete from LRU cache
    lruCache.del(fullKey);

    return true;
  } catch (error) {
    metrics.errors++;
    logger.error("Cache delete error", {
      error: error.message,
      namespace,
      key,
    });
    return false;
  }
};

/**
 * Clear entire cache
 * @returns {Promise<boolean>} Success status
 */
const clear = async () => {
  try {
    // Clear Redis
    await redisClient.flushdb();

    // Clear LRU cache
    lruCache.reset();

    // Reset metrics
    resetMetrics();

    return true;
  } catch (error) {
    metrics.errors++;
    logger.error("Cache clear error", {
      error: error.message,
    });
    return false;
  }
};

export { clear, del, get, getMetrics, set };
