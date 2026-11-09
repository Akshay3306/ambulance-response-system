const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 100 },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true, select: false },
    phone: { type: String, default: "", trim: true },
    role: { type: String, enum: ["admin", "dispatcher", "driver", "requester"], required: true },
    active: { type: Boolean, default: true },
    licenseNumber: { type: String, default: "" },
  },
  { timestamps: true }
);

module.exports = mongoose.model("User", userSchema);
