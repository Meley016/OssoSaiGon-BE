// src/models/User.js
const mongoose = require("mongoose");
const bcrypt = require("bcrypt");

// Loyalty subdocument for each user
const loyaltySchema = new mongoose.Schema(
  {
    tier: { type: String, default: "bronze" }, // current tier key
    points: { type: Number, default: 0 } // current points
  },
  { _id: false }
);

// Tier item schema for config
const tierItemSchema = new mongoose.Schema(
  {
    key: { type: String, required: true }, // e.g. "bronze"
    name: { type: String, required: true }, // display name
    emoji: { type: String, default: "" },   // optional emoji
    minPoints: { type: Number, default: 0 } // minimum points to achieve this tier
  },
  { _id: false }
);

// Loyalty config (singleton document in its own collection)
const loyaltyConfigSchema = new mongoose.Schema(
  {
    tiers: { type: [tierItemSchema], default: [] },
    pointRate: { type: Number, default: 10000 }, // 10000 VND = 1 point (default)
    updatedAt: { type: Date, default: Date.now }
  },
  { collection: "loyalty_configs" }
);

// Loyalty history entries
const loyaltyHistorySchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    changeType: { type: String }, // "points_adjust", "tier_change", "apply_config"
    delta: { type: Number },      // points delta
    before: { tier: String, points: Number },
    after: { tier: String, points: Number },
    reason: { type: String },
    createdAt: { type: Date, default: Date.now }
  },
  { collection: "loyalty_histories" }
);

// User schema
const userSchema = new mongoose.Schema(
  {
    name: { type: String, trim: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    avatar: { type: String, default: "" },
    birthday: { type: Date },
    address: { type: String, trim: true },

    role: { type: String, enum: ["user", "admin", "writer", "productAdder"], default: "user" },

    loyalty: { type: loyaltySchema, default: () => ({}) },

    isBlocked: { type: Boolean, default: false },
    emailPending: { type: String },
    emailToken: { type: String },
    emailTokenExpire: { type: Date },

    passwordPending: { type: String }, // tạm lưu password đã hash
    passwordToken: { type: String },
    passwordTokenExpire: { type: Date },
  },
  { timestamps: true }
);

// hash password
userSchema.pre("save", async function (next) {
  if (this.isModified("password")) {
    this.password = await bcrypt.hash(this.password, 10);
  }
  next();
});

userSchema.methods.comparePassword = async function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

// Avoid re-registering models in dev hot reload
const User = mongoose.models.User || mongoose.model("User", userSchema);
const LoyaltyConfig = mongoose.models.LoyaltyConfig || mongoose.model("LoyaltyConfig", loyaltyConfigSchema);
const LoyaltyHistory = mongoose.models.LoyaltyHistory || mongoose.model("LoyaltyHistory", loyaltyHistorySchema);

module.exports = {
  User,
  LoyaltyConfig,
  LoyaltyHistory
};
