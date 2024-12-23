import mongoose from "mongoose";
import logger from "./logger.js";

const connectWithRetry = async (retries = 5, delay = 5000) => {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      await mongoose.connect(process.env.MONGODB_URI);
      logger.info("MongoDB connected successfully");
      return;
    } catch (error) {
      logger.error(`MongoDB connection attempt ${attempt} failed:`, {
        error: error.message,
        stack: error.stack,
      });

      if (attempt === retries) {
        logger.error("Max retries reached. Exiting...");
        process.exit(1);
      }

      logger.info(`Retrying in ${delay / 1000} seconds...`);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
};

export default connectWithRetry;
