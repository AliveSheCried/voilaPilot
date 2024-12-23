import { param, query, validationResult } from "express-validator";

/**
 * Validate transaction query parameters
 */
const validateTransactionParams = [
  query("from")
    .optional()
    .isISO8601()
    .withMessage("From date must be in ISO 8601 format (YYYY-MM-DD)"),
  query("to")
    .optional()
    .isISO8601()
    .withMessage("To date must be in ISO 8601 format (YYYY-MM-DD)"),
  query("limit")
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage("Limit must be between 1 and 100"),
  param("accountId")
    .optional()
    .isString()
    .trim()
    .notEmpty()
    .withMessage("Account ID must be a valid string"),
  validateResults,
];

/**
 * Process validation results
 */
function validateResults(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      error: "VALIDATION_ERROR",
      message: "Invalid request parameters",
      details: errors.array().map((err) => ({
        field: err.param,
        message: err.msg,
        value: err.value,
      })),
    });
  }
  next();
}

/**
 * Validate API version
 */
function validateApiVersion(req, res, next) {
  const version = req.path.split("/")[2]; // Extract version from /api/v1/...
  if (version !== "v1") {
    return res.status(400).json({
      success: false,
      error: "INVALID_API_VERSION",
      message: "Invalid API version. Currently supported version is v1",
    });
  }
  next();
}

export { validateApiVersion, validateTransactionParams };
