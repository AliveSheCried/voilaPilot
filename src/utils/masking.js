/**
 * Mask an IP address
 * @param {string} ip - IP address to mask
 * @returns {string} Masked IP address
 */
const maskIP = (ip) => {
  if (!ip) return "";
  const parts = ip.split(".");
  if (parts.length === 4) {
    return `${parts[0]}.${parts[1]}.*.*`;
  }
  return ip.substring(0, ip.length / 2) + "*".repeat(ip.length / 2);
};

/**
 * Mask an email address
 * @param {string} email - Email address to mask
 * @returns {string} Masked email address
 */
const maskEmail = (email) => {
  if (!email) return "";
  const [local, domain] = email.split("@");
  if (!domain) return email;
  const maskedLocal =
    local.charAt(0) +
    "*".repeat(local.length - 2) +
    local.charAt(local.length - 1);
  return `${maskedLocal}@${domain}`;
};

/**
 * Mask an API key
 * @param {string} key - API key to mask
 * @returns {string} Masked API key
 */
const maskApiKey = (key) => {
  if (!key) return "";
  const visibleChars = 4;
  return "*".repeat(key.length - visibleChars) + key.slice(-visibleChars);
};

/**
 * Mask sensitive data in an object
 * @param {Object} data - Object containing sensitive data
 * @returns {Object} Object with masked sensitive data
 */
const maskSensitiveData = (data) => {
  if (!data || typeof data !== "object") return data;

  const sensitiveFields = [
    "password",
    "token",
    "apiKey",
    "secret",
    "email",
    "ip",
    "accessToken",
    "refreshToken",
  ];

  const maskedData = { ...data };

  for (const [key, value] of Object.entries(data)) {
    if (typeof value === "object" && value !== null) {
      maskedData[key] = maskSensitiveData(value);
    } else if (typeof value === "string") {
      const lowerKey = key.toLowerCase();
      if (sensitiveFields.some((field) => lowerKey.includes(field))) {
        if (lowerKey.includes("email")) {
          maskedData[key] = maskEmail(value);
        } else if (lowerKey.includes("ip")) {
          maskedData[key] = maskIP(value);
        } else if (lowerKey.includes("key") || lowerKey.includes("token")) {
          maskedData[key] = maskApiKey(value);
        } else {
          maskedData[key] = "*".repeat(8);
        }
      }
    }
  }

  return maskedData;
};

/**
 * Create a safe logging context by masking sensitive data
 * @param {Object} context - Logging context object
 * @returns {Object} Safe logging context with masked sensitive data
 */
const createSafeLoggingContext = (context) => {
  if (!context || typeof context !== "object") return context;

  // Clone the context to avoid modifying the original
  const safeContext = JSON.parse(JSON.stringify(context));

  return maskSensitiveData(safeContext);
};

export {
  createSafeLoggingContext,
  maskApiKey,
  maskEmail,
  maskIP,
  maskSensitiveData,
};
