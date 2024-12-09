const mongoose = require("mongoose");
const logger = require("./logger");

const MAX_RETRIES = 3;
const RETRY_DELAY = 5000; // 5 seconds

const connectWithRetry = async (retryCount = 0) => {
  try {
    await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });

    logger.info(`MongoDB Connected: ${mongoose.connection.host}`);

    mongoose.connection.on("error", (err) => {
      logger.error("MongoDB connection error:", err);
    });

    mongoose.connection.on("disconnected", () => {
      logger.warn("MongoDB disconnected. Attempting to reconnect...");
      setTimeout(() => connectWithRetry(0), RETRY_DELAY);
    });
  } catch (error) {
    if (retryCount < MAX_RETRIES) {
      logger.warn(
        `MongoDB connection attempt ${retryCount + 1} failed. Retrying in ${
          RETRY_DELAY / 1000
        } seconds...`
      );
      setTimeout(() => connectWithRetry(retryCount + 1), RETRY_DELAY);
    } else {
      logger.error(
        "Failed to connect to MongoDB after maximum retries:",
        error
      );
      process.exit(1);
    }
  }
};

module.exports = connectWithRetry;
