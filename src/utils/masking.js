/**
 * Utility functions for masking sensitive data
 */

/**
 * Mask an IP address by hiding the last two octets
 * @param {string} ip - IP address to mask
 * @returns {string} Masked IP address
 */
const maskIP = (ip) => {
  if (!ip) return ip;

  // Handle IPv4
  if (ip.includes(".")) {
    const parts = ip.split(".");
    if (parts.length === 4) {
      return `${parts[0]}.${parts[1]}.xxx.xxx`;
    }
  }

  // Handle IPv6
  if (ip.includes(":")) {
    const parts = ip.split(":");
    if (parts.length > 2) {
      return parts.slice(0, 3).join(":") + ":xxxx:xxxx";
    }
  }

  // Handle localhost and other special cases
  if (ip === "::1" || ip === "127.0.0.1") {
    return "localhost";
  }

  return "xxx.xxx.xxx.xxx";
};

/**
 * Mask an email address
 * @param {string} email - Email address to mask
 * @returns {string} Masked email address
 */
const maskEmail = (email) => {
  if (!email) return email;

  const [local, domain] = email.split("@");
  if (!domain) return email;

  const maskedLocal =
    local.length > 2
      ? `${local[0]}${new Array(local.length - 1).join("*")}${local[local.length - 1]}`
      : local[0] + "**";

  return `${maskedLocal}@${domain}`;
};

/**
 * Mask an API key
 * @param {string} key - API key to mask
 * @returns {string} Masked API key
 */
const maskApiKey = (key) => {
  if (!key) return key;

  if (key.startsWith("vk_")) {
    return `vk_${new Array(8).join("*")}`;
  }

  return new Array(8).join("*");
};

/**
 * Mask sensitive data in an object
 * @param {Object} obj - Object containing potentially sensitive data
 * @returns {Object} Object with masked sensitive data
 */
const maskSensitiveData = (obj) => {
  if (!obj || typeof obj !== "object") return obj;

  const masked = { ...obj };

  // Mask known sensitive fields
  if (masked.ip) masked.ip = maskIP(masked.ip);
  if (masked.email) masked.email = maskEmail(masked.email);
  if (masked.apiKey) masked.apiKey = maskApiKey(masked.apiKey);
  if (masked.key) masked.key = maskApiKey(masked.key);

  // Recursively mask nested objects
  Object.keys(masked).forEach((key) => {
    if (typeof masked[key] === "object" && masked[key] !== null) {
      masked[key] = maskSensitiveData(masked[key]);
    }
  });

  return masked;
};

/**
 * Create a production-safe logging context
 * @param {Object} context - Logging context
 * @returns {Object} Masked logging context for production
 */
const createSafeLoggingContext = (context) => {
  if (process.env.NODE_ENV !== "production") {
    return context;
  }

  return maskSensitiveData(context);
};

module.exports = {
  maskIP,
  maskEmail,
  maskApiKey,
  maskSensitiveData,
  createSafeLoggingContext,
};
