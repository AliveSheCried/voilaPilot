const Joi = require("joi");
const { ValidationError } = require("../utils/errors");
const logger = require("../config/logger");

// Schema for user registration
const registerSchema = Joi.object({
  email: Joi.string().email().required().messages({
    "string.email": "Please provide a valid email address",
    "any.required": "Email is required",
  }),
  password: Joi.string()
    .min(8)
    .pattern(
      /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/
    )
    .required()
    .messages({
      "string.min": "Password must be at least 8 characters long",
      "string.pattern.base":
        "Password must contain at least one uppercase letter, one lowercase letter, one number and one special character",
      "any.required": "Password is required",
    }),
  confirmPassword: Joi.string().valid(Joi.ref("password")).required().messages({
    "any.only": "Passwords must match",
    "any.required": "Password confirmation is required",
  }),
});

// Schema for user login
const loginSchema = Joi.object({
  email: Joi.string().email().required().messages({
    "string.email": "Please provide a valid email address",
    "any.required": "Email is required",
  }),
  password: Joi.string().required().messages({
    "any.required": "Password is required",
  }),
});

// Schema for token refresh
const refreshTokenSchema = Joi.object({
  refreshToken: Joi.string().required().messages({
    "any.required": "Refresh token is required",
  }),
});

// Schema for TrueLayer token exchange
const trueLayerTokenSchema = Joi.object({
  code: Joi.string().required().messages({
    "any.required": "Authorization code is required",
  }),
});

/**
 * Validation middleware factory
 * @param {Joi.Schema} schema - Joi validation schema
 * @param {string} source - Request property to validate ('body', 'query', 'params')
 */
const validate = (schema, source = "body") => {
  return (req, res, next) => {
    const { error, value } = schema.validate(req[source], {
      abortEarly: false,
      stripUnknown: true,
    });

    if (error) {
      const details = error.details.map((err) => ({
        field: err.path.join("."),
        message: err.message,
        type: err.type,
      }));

      logger.debug("Validation failed", {
        path: req.path,
        method: req.method,
        errors: details,
      });

      return next(new ValidationError("Validation failed", details));
    }

    // Replace request data with validated data
    req[source] = value;
    next();
  };
};

// Middleware instances
const validateRegistration = validate(registerSchema);
const validateLogin = validate(loginSchema);
const validateRefreshToken = validate(refreshTokenSchema);
const validateTrueLayerToken = validate(trueLayerTokenSchema);

module.exports = {
  registerSchema,
  loginSchema,
  refreshTokenSchema,
  trueLayerTokenSchema,
  validateRegistration,
  validateLogin,
  validateRefreshToken,
  validateTrueLayerToken,
};
