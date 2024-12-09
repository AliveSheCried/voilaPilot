const Joi = require("joi");

const registerSchema = Joi.object({
  username: Joi.string()
    .min(3)
    .max(30)
    .required()
    .trim()
    .pattern(/^[a-zA-Z0-9_-]+$/)
    .messages({
      "string.pattern.base":
        "Username can only contain letters, numbers, underscores and dashes",
      "string.min": "Username must be at least 3 characters long",
      "string.max": "Username cannot exceed 30 characters",
      "any.required": "Username is required",
    }),

  email: Joi.string().email().required().trim().lowercase().messages({
    "string.email": "Please enter a valid email address",
    "any.required": "Email is required",
  }),

  password: Joi.string()
    .min(8)
    .max(50)
    .required()
    .pattern(
      /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/
    )
    .messages({
      "string.pattern.base":
        "Password must contain at least one uppercase letter, one lowercase letter, one number and one special character",
      "string.min": "Password must be at least 8 characters long",
      "string.max": "Password cannot exceed 50 characters",
      "any.required": "Password is required",
    }),

  confirmPassword: Joi.string().valid(Joi.ref("password")).required().messages({
    "any.only": "Passwords must match",
    "any.required": "Password confirmation is required",
  }),
}).options({
  allowUnknown: process.env.NODE_ENV !== "production",
  stripUnknown: true,
  presence: "required",
});

const loginSchema = Joi.object({
  email: Joi.string().email().required().trim().lowercase().messages({
    "string.email": "Please enter a valid email address",
    "any.required": "Email is required",
  }),

  password: Joi.string().required().messages({
    "any.required": "Password is required",
  }),
}).options({
  allowUnknown: process.env.NODE_ENV !== "production",
  stripUnknown: true,
  presence: "required",
});

module.exports = {
  registerSchema,
  loginSchema,
};
