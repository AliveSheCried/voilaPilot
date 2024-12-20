const mongoose = require("mongoose");
const ApiKeyService = require("../services/apiKeyService");

const apiKeyMethods = {
  async addApiKey(name) {
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
  },

  async verifyApiKey(key) {
    const user = await this.model("User").findById(this._id).select("apiKeys");

    for (const apiKey of user.apiKeys) {
      if (
        apiKey.isActive &&
        (await ApiKeyService.verifyKey(key, apiKey.hashedKey))
      ) {
        apiKey.lastUsed = new Date();
        await user.save();
        return true;
      }
    }
    return false;
  },

  async deactivateApiKey(keyId) {
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
  },
};

module.exports = apiKeyMethods;
