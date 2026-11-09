const mongoose = require("mongoose");

const emergencyRequestSchema = new mongoose.Schema(
  {
    requestNumber: { type: String, required: true, unique: true },
    requester: {
      userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
      name: { type: String, required: true, trim: true, maxlength: 100 },
      phone: { type: String, required: true, trim: true, maxlength: 30 },
    },
    patientName: { type: String, trim: true, maxlength: 100, default: "" },
    emergencyType: { type: String, required: true, enum: ["medical", "cardiac", "trauma", "obstetric", "other"] },
    priority: { type: String, enum: ["critical", "high", "standard"], default: "high" },
    notes: { type: String, trim: true, maxlength: 1000, default: "" },
    pickup: {
      address: { type: String, required: true, trim: true, maxlength: 250 },
      lat: { type: Number, required: true, min: -90, max: 90 },
      lng: { type: Number, required: true, min: -180, max: 180 },
    },
    status: {
      type: String,
      enum: ["pending", "dispatched", "en-route", "on-scene", "completed", "cancelled"],
      default: "pending",
      index: true,
    },
    assignedAmbulance: { type: mongoose.Schema.Types.ObjectId, ref: "Ambulance", default: null },
    assignedDriver: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    timeline: [{
      status: { type: String, required: true },
      at: { type: Date, default: Date.now },
      note: { type: String, maxlength: 200, default: "" },
      actor: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    }],
    dispatchedAt: { type: Date, default: null },
    arrivedAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
    estimatedMinutes: { type: Number, default: null, min: 1, max: 240 },
  },
  { timestamps: true }
);

emergencyRequestSchema.index({ status: 1, createdAt: -1 });
emergencyRequestSchema.index({ assignedDriver: 1, status: 1 });
emergencyRequestSchema.index({ createdAt: -1 });

module.exports = mongoose.model("EmergencyRequest", emergencyRequestSchema);
