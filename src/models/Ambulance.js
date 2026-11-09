const mongoose = require("mongoose");

const ambulanceSchema = new mongoose.Schema(
  {
    callSign: { type: String, required: true, unique: true, trim: true },
    vehicle: { type: String, required: true, trim: true },
    station: { type: String, required: true, trim: true },
    status: { type: String, enum: ["available", "assigned", "on-scene", "maintenance"], default: "available" },
    driver: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    activeRequest: { type: mongoose.Schema.Types.ObjectId, ref: "EmergencyRequest", default: null },
    location: {
      lat: { type: Number, default: 17.385 },
      lng: { type: Number, default: 78.4867 },
      updatedAt: { type: Date, default: Date.now },
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Ambulance", ambulanceSchema);
