import Joi from "joi";
import logger from "../config/logger.js";

const createKeySchema = Joi.object({
  name: Joi.string()
    .required()
    .trim()
    .min(3)
    .max(50)
    .pattern(/^[a-zA-Z0-9-_ ]+$/)
    .messages({
      "string.pattern.base":
        "Key name can only contain letters, numbers, spaces, hyphens, and underscores",
      "string.min": "Key name must be at least 3 characters long",
      "string.max": "Key name cannot exceed 50 characters",
      "any.required": "Key name is required",
    }),
  expiresIn: Joi.number().integer().min(1).max(365).default(90).messages({
    "number.base": "Expiration days must be a number",
    "number.min": "Expiration days must be at least 1",
    "number.max": "Expiration days cannot exceed 365",
  }),
});

const validateCreateKey = (req, res, next) => {
  const { error, value } = createKeySchema.validate(req.body, {
    abortEarly: false,
    stripUnknown: true,
  });

  if (error) {
    logger.warn("Invalid API key creation request", {
      userId: req.user?.id,
      errors: error.details.map((detail) => detail.message),
    });

    return res.status(400).json({
      success: false,
      error: "VALIDATION_ERROR",
      message: "Invalid request data",
      details: error.details.map((detail) => detail.message),
    });
  }

  // Attach validated data to request
  req.validatedData = value;
  next();
};

const validateKeyId = (req, res, next) => {
  const schema = Joi.object({
    keyId: Joi.string()
      .required()
      .pattern(/^[0-9a-fA-F]{24}$/)
      .messages({
        "string.pattern.base": "Invalid key ID format",
        "any.required": "Key ID is required",
      }),
  });

  const { error } = schema.validate({ keyId: req.params.keyId });

  if (error) {
    logger.warn("Invalid key ID format", {
      userId: req.user?.id,
      keyId: req.params.keyId,
      error: error.message,
    });

    return res.status(400).json({
      success: false,
      error: "VALIDATION_ERROR",
      message: "Invalid key ID format",
    });
  }

  next();
};

export { validateCreateKey, validateKeyId };
