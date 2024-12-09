const dotenv = require("dotenv");
const path = require("path");
const logger = require("./logger");

// Load env vars
dotenv.config({ path: path.join(__dirname, "../../.env") });

// Validate critical environment variables
const requiredEnvVars = [
  "MONGODB_URI",
  "JWT_SECRET",
  "NODE_ENV",
  "TRUELAYER_CLIENT_ID",
  "TRUELAYER_CLIENT_SECRET",
];

const missingEnvVars = requiredEnvVars.filter((envVar) => !process.env[envVar]);

if (missingEnvVars.length > 0) {
  throw new Error(
    `Missing required environment variables: ${missingEnvVars.join(", ")}`
  );
}

const config = {
  env: process.env.NODE_ENV || "development",
  port: process.env.PORT || 5000,
  mongoUri: process.env.MONGODB_URI,
  jwt: {
    secret: process.env.JWT_SECRET,
    expiresIn: process.env.JWT_EXPIRES_IN || "1d",
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 24 * 60 * 60 * 1000, // 1 day
    },
  },
  trueLayer: {
    clientId: process.env.TRUELAYER_CLIENT_ID,
    clientSecret: process.env.TRUELAYER_CLIENT_SECRET,
    kid: process.env.KID,
    privateKey: process.env.PRIVATE_KEY,
  },
  cors: {
    origin:
      process.env.NODE_ENV === "production"
        ? process.env.CLIENT_URL
        : "http://localhost:3000",
    credentials: true,
  },
  logs: {
    level: process.env.NODE_ENV === "production" ? "error" : "debug",
  },
};

module.exports = config;
