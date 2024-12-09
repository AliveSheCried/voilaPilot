const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

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
      select: false, // Don't include password in queries by default
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
    timestamps: true, // Automatically manage createdAt and updatedAt
  }
);

// Hash password before saving
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

// Method to compare passwords
userSchema.methods.comparePassword = async function (candidatePassword) {
  try {
    return await bcrypt.compare(candidatePassword, this.password);
  } catch (error) {
    throw new Error(error);
  }
};

// Add version key for optimistic concurrency control
userSchema.set("timestamps", true);
userSchema.set("versionKey", true);

// Modify soft delete method to use optimistic concurrency control
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

// Modify default find queries to exclude soft-deleted documents
userSchema.pre(/^find/, function (next) {
  if (!this.getQuery().includeSoftDeleted) {
    this.where({ isDeleted: false });
  }
  next();
});

const User = mongoose.model("User", userSchema);

module.exports = User;
