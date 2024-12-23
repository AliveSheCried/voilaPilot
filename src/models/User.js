import bcrypt from "bcryptjs";
import mongoose from "mongoose";
import ApiKeyService from "../services/apiKeyService.js";
import apiKeyMethods from "./apiKeyMethods.js";

// API Key Schema
const apiKeySchema = new mongoose.Schema(
  {
    key: {
      type: String,
      required: [true, "API key is required"],
      select: false,
    },
    name: {
      type: String,
      required: [true, "Key name is required"],
      trim: true,
      maxlength: [50, "Key name cannot exceed 50 characters"],
      index: true,
    },
    hashedKey: {
      type: String,
      required: true,
      index: true,
    },
    lastUsed: {
      type: Date,
      default: null,
      index: true,
    },
    createdAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
    expiresAt: {
      type: Date,
      default: () => new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
      index: true,
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
  },
  {
    _id: true,
  }
);

// Compound indexes for common queries
apiKeySchema.index({ isActive: 1, expiresAt: 1 });
apiKeySchema.index({ userId: 1, isActive: 1 });

// Pre-save middleware to clean expired keys
apiKeySchema.pre("save", async function (next) {
  const now = new Date();

  // Filter out expired or unused keys (not used in last 90 days)
  this.apiKeys = this.apiKeys.filter((key) => {
    const isExpired = key.expiresAt && key.expiresAt < now;
    const isUnused =
      key.lastUsed && now - key.lastUsed > 90 * 24 * 60 * 60 * 1000;

    return !isExpired && !isUnused;
  });

  // Update apiKeyCount
  this.apiKeyCount = this.apiKeys.length;

  next();
});

// Static method to clean up expired keys across all users
userSchema.statics.cleanupExpiredKeys = async function () {
  const now = new Date();
  const ninetyDaysAgo = new Date(now - 90 * 24 * 60 * 60 * 1000);

  try {
    const result = await this.updateMany(
      {
        $or: [
          { "apiKeys.expiresAt": { $lt: now } },
          { "apiKeys.lastUsed": { $lt: ninetyDaysAgo } },
        ],
      },
      {
        $pull: {
          apiKeys: {
            $or: [
              { expiresAt: { $lt: now } },
              { lastUsed: { $lt: ninetyDaysAgo } },
            ],
          },
        },
      }
    );

    logger.info("Cleaned up expired API keys", {
      modifiedUsers: result.modifiedCount,
    });

    // Update apiKeyCount for affected users
    await this.aggregate([
      {
        $match: { "apiKeys.0": { $exists: true } },
      },
      {
        $set: {
          apiKeyCount: { $size: "$apiKeys" },
        },
      },
    ]);

    return result;
  } catch (error) {
    logger.error("Failed to clean up expired keys:", error);
    throw error;
  }
};

const userSchema = new mongoose.Schema(
  {
    username: {
      type: String,
      required: [true, "Username is required"],
      unique: true,
      trim: true,
      minlength: [3, "Username must be at least 3 characters long"],
    },
    email: {
      type: String,
      required: [true, "Email is required"],
      unique: true,
      trim: true,
      lowercase: true,
      match: [
        /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/,
        "Please enter a valid email",
      ],
    },
    password: {
      type: String,
      required: [true, "Password is required"],
      minlength: [8, "Password must be at least 8 characters long"],
      select: false,
    },
    role: {
      type: String,
      enum: ["user", "admin"],
      default: "user",
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    lastLogin: {
      type: Date,
      default: null,
    },
    apiKeys: [apiKeySchema],
    apiKeyCount: {
      type: Number,
      default: 0,
      max: [5, "Maximum of 5 API keys allowed"],
    },
    trueLayerAccessToken: {
      type: String,
      select: false,
    },
    trueLayerRefreshToken: {
      type: String,
      select: false,
    },
    trueLayerTokenExpiresAt: {
      type: Date,
      default: null,
      validate: {
        validator: function (value) {
          return !value || value > new Date();
        },
        message: "Token expiration date must be in the future",
      },
    },
    trueLayerConnected: {
      type: Boolean,
      default: false,
    },
    trueLayerTokenVersion: {
      type: Number,
      default: 0,
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
    updatedAt: {
      type: Date,
      default: Date.now,
    },
    isDeleted: {
      type: Boolean,
      default: false,
    },
    deletedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
    optimisticConcurrency: true,
  }
);

userSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();

  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

userSchema.methods.comparePassword = async function (candidatePassword) {
  try {
    return await bcrypt.compare(candidatePassword, this.password);
  } catch (error) {
    throw new Error(error);
  }
};

userSchema.set("timestamps", true);
userSchema.set("versionKey", true);

userSchema.methods.softDelete = async function () {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const user = await this.model("User").findOneAndUpdate(
      {
        _id: this._id,
        isDeleted: false,
        __v: this.__v,
      },
      {
        $set: {
          isDeleted: true,
          deletedAt: new Date(),
          isActive: false,
        },
        $inc: { __v: 1 },
      },
      {
        new: true,
        session,
        runValidators: true,
      }
    );

    if (!user) {
      throw new Error("User has been modified or already deleted");
    }

    await session.commitTransaction();
    return user;
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
};

userSchema.methods.restore = async function () {
  this.isDeleted = false;
  this.deletedAt = null;
  this.isActive = true;
  return await this.save();
};

userSchema.pre(/^find/, function (next) {
  if (!this.getQuery().includeSoftDeleted) {
    this.where({ isDeleted: false });
  }
  next();
});

userSchema.methods.updateTrueLayerTokens = async function (tokens) {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const user = await this.model("User").findOneAndUpdate(
      {
        _id: this._id,
        trueLayerTokenVersion: this.trueLayerTokenVersion,
      },
      {
        $set: {
          trueLayerAccessToken: tokens.access_token,
          trueLayerRefreshToken: tokens.refresh_token,
          trueLayerTokenExpiresAt: new Date(
            Date.now() + tokens.expires_in * 1000
          ),
          trueLayerConnected: true,
        },
        $inc: { trueLayerTokenVersion: 1 },
      },
      {
        new: true,
        session,
        runValidators: true,
      }
    );

    if (!user) {
      throw new Error("Token update failed due to concurrent modification");
    }

    await session.commitTransaction();
    return user;
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
};

userSchema.methods.addApiKey = async function (name) {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    if (this.apiKeyCount >= 5) {
      throw new Error("Maximum number of API keys reached");
    }

    const key = ApiKeyService.generateKey();
    const hashedKey = await ApiKeyService.hashKey(key);

    const user = await this.model("User").findOneAndUpdate(
      {
        _id: this._id,
        apiKeyCount: { $lt: 5 },
      },
      {
        $push: { apiKeys: { key, name, hashedKey } },
        $inc: { apiKeyCount: 1 },
      },
      {
        new: true,
        session,
        runValidators: true,
      }
    );

    if (!user) {
      throw new Error("Failed to add API key");
    }

    await session.commitTransaction();
    return { key, id: user.apiKeys[user.apiKeys.length - 1]._id };
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
};

userSchema.methods.verifyApiKey = async function (key) {
  // First, try to find the key directly using indexes
  const user = await this.model("User")
    .findOne({
      _id: this._id,
      "apiKeys.isActive": true,
      "apiKeys.expiresAt": { $gt: new Date() },
    })
    .select("apiKeys")
    .lean();

  if (!user) return false;

  // Use Promise.any to check all keys concurrently
  try {
    await Promise.any(
      user.apiKeys
        .filter((k) => k.isActive)
        .map(async (apiKey) => {
          const isValid = await ApiKeyService.verifyKey(key, apiKey.hashedKey);
          if (!isValid) throw new Error("Key doesn't match");

          // Update lastUsed timestamp
          await this.model("User").updateOne(
            {
              _id: this._id,
              "apiKeys._id": apiKey._id,
            },
            {
              $set: { "apiKeys.$.lastUsed": new Date() },
            }
          );

          return true;
        })
    );
    return true;
  } catch {
    return false;
  }
};

userSchema.methods.deactivateApiKey = async function (keyId) {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const user = await this.model("User").findOneAndUpdate(
      {
        _id: this._id,
        "apiKeys._id": keyId,
        "apiKeys.isActive": true,
      },
      {
        $set: { "apiKeys.$.isActive": false },
      },
      {
        new: true,
        session,
        runValidators: true,
      }
    );

    if (!user) {
      throw new Error("API key not found or already deactivated");
    }

    await session.commitTransaction();
    return user.apiKeys.id(keyId);
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
};

// Add API key methods to the user schema
Object.assign(userSchema.methods, apiKeyMethods);

const User = mongoose.model("User", userSchema);

export default User;
