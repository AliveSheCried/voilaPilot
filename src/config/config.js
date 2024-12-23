import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import logger from "./logger.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
  const errorMessage = `Missing required environment variables: ${missingEnvVars.join(
    ", "
  )}`;
  logger.error(errorMessage, {
    availableVars: Object.keys(process.env).filter(
      (key) => !key.includes("KEY")
    ), // Log available vars without sensitive data
    environment: process.env.NODE_ENV,
  });
  throw new Error(errorMessage);
}

// Validate TrueLayer private key format
if (!process.env.PRIVATE_KEY?.includes("BEGIN EC PRIVATE KEY")) {
  logger.error("Invalid TrueLayer private key format");
  throw new Error("TrueLayer private key is missing or invalid");
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
    apiUrl: process.env.TRUELAYER_API_URL,
    kid: process.env.KID,
    privateKey: process.env.PRIVATE_KEY,
    scopes: [
      "info",
      "accounts",
      "balance",
      "cards",
      "transactions",
      "offline_access",
    ],
    redirectUri:
      process.env.NODE_ENV === "production"
        ? process.env.TRUELAYER_REDIRECT_URI
        : "http://localhost:3000/callback",
    authUrl: "https://auth.truelayer.com",
    tokenEndpoint: "/connect/token",
    apiVersion: "v1",
    timeout: 10000, // 10 seconds
    retryAttempts: 3,
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

export default config;
