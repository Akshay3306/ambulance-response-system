const crypto = require("node:crypto");
const express = require("express");
const mongoose = require("mongoose");
const Ambulance = require("../models/Ambulance");
const EmergencyRequest = require("../models/EmergencyRequest");
const User = require("../models/User");
const { authenticate, allowRoles } = require("../middleware/auth");
const { canTransition } = require("../lib/requestStatus");

const router = express.Router();
router.use(authenticate);

router.get("/", async (req, res, next) => {
  try {
    const filter = {};
    if (req.user.role === "driver") filter.assignedDriver = req.user._id;
    if (req.user.role === "requester") filter["requester.userId"] = req.user._id;
    if (req.query.status && ["pending", "dispatched", "en-route", "on-scene", "completed", "cancelled"].includes(req.query.status)) {
      filter.status = req.query.status;
    }
    const requests = await EmergencyRequest.find(filter)
      .sort({ createdAt: -1 })
      .limit(Math.min(Number(req.query.limit) || 100, 200))
      .populate("assignedAmbulance", "callSign vehicle location status")
      .populate("assignedDriver", "name phone");
    res.json({ requests });
  } catch (error) {
    next(error);
  }
});

router.post("/", allowRoles("admin", "dispatcher", "requester"), async (req, res, next) => {
  try {
    const body = req.body;
    const name = String(body.name || req.user.name).trim();
    const phone = String(body.phone || req.user.phone).trim();
    const address = String(body.address || "").trim();
    const lat = Number(body.lat);
    const lng = Number(body.lng);
    const types = ["medical", "cardiac", "trauma", "obstetric", "other"];
    if (!name || !phone || !address || !Number.isFinite(lat) || lat < -90 || lat > 90 || !Number.isFinite(lng) || lng < -180 || lng > 180) {
      return res.status(400).json({ error: "Contact name, phone, pickup address, and valid coordinates are required." });
    }
    if (!types.includes(body.emergencyType)) return res.status(400).json({ error: "Select a valid emergency type." });
    const priority = ["critical", "high", "standard"].includes(body.priority) ? body.priority : "high";
    const request = await EmergencyRequest.create({
      requestNumber: `EMS-${Date.now().toString().slice(-6)}-${crypto.randomBytes(2).toString("hex").toUpperCase()}`,
      requester: { userId: req.user.role === "requester" ? req.user._id : null, name, phone },
      patientName: String(body.patientName || "").trim(),
      emergencyType: body.emergencyType,
      priority,
      notes: String(body.notes || "").trim(),
      pickup: { address, lat, lng },
      timeline: [{ status: "pending", actor: req.user._id, note: "Emergency request received" }],
    });
    res.status(201).json({ request });
  } catch (error) {
    next(error);
  }
});

router.patch("/:id/dispatch", allowRoles("admin", "dispatcher"), async (req, res, next) => {
  try {
    const { ambulanceId, driverId } = req.body;
    if (!mongoose.isValidObjectId(req.params.id) || !mongoose.isValidObjectId(ambulanceId) || !mongoose.isValidObjectId(driverId)) {
      return res.status(400).json({ error: "Choose a valid request, ambulance, and driver." });
    }
    const driver = await User.findOne({ _id: driverId, role: "driver", active: true });
    if (!driver) return res.status(400).json({ error: "Choose an active ambulance driver." });

    const request = await EmergencyRequest.findOne({ _id: req.params.id, status: "pending" });
    if (!request) return res.status(404).json({ error: "Pending request not found." });
    const ambulance = await Ambulance.findOneAndUpdate(
      { _id: ambulanceId, status: "available", activeRequest: null },
      { $set: { status: "assigned", driver: driver._id, activeRequest: request._id } },
      { new: true }
    );
    if (!ambulance) return res.status(409).json({ error: "That ambulance is no longer available. Refresh the fleet and try again." });

    let assignedRequest;
    try {
      const dispatchedAt = new Date();
      const estimatedMinutes = Math.max(5, Math.min(60, Math.round(
        (Math.abs(ambulance.location.lat - request.pickup.lat) + Math.abs(ambulance.location.lng - request.pickup.lng)) * 65
      )));
      assignedRequest = await EmergencyRequest.findOneAndUpdate(
        { _id: request._id, status: "pending" },
        {
          $set: { status: "dispatched", assignedAmbulance: ambulance._id, assignedDriver: driver._id, dispatchedAt, estimatedMinutes },
          $push: { timeline: { status: "dispatched", at: dispatchedAt, actor: req.user._id, note: `${ambulance.callSign} dispatched` } },
        },
        { new: true, runValidators: true }
      );
      if (!assignedRequest) {
        await Ambulance.updateOne({ _id: ambulance._id, activeRequest: request._id }, {
          $set: { status: "available", driver: null, activeRequest: null },
        });
        return res.status(409).json({ error: "This request was already assigned. Refresh the dispatch queue." });
      }
    } catch (error) {
      await Ambulance.updateOne({ _id: ambulance._id, activeRequest: request._id }, {
        $set: { status: "available", driver: null, activeRequest: null },
      });
      throw error;
    }
    await assignedRequest.populate([
      { path: "assignedAmbulance", select: "callSign vehicle location status" },
      { path: "assignedDriver", select: "name phone" },
    ]);
    res.json({ request: assignedRequest });
  } catch (error) {
    next(error);
  }
});

router.patch("/:id/status", async (req, res, next) => {
  try {
    const nextStatus = req.body.status;
    if (!["dispatched", "en-route", "on-scene", "completed", "cancelled"].includes(nextStatus)) {
      return res.status(400).json({ error: "Select a valid next status." });
    }
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ error: "Invalid emergency request ID." });
    const request = await EmergencyRequest.findById(req.params.id);
    if (!request) return res.status(404).json({ error: "Emergency request not found." });
    if (req.user.role === "requester") return res.status(403).json({ error: "Requesters cannot update dispatch status." });
    if (req.user.role === "driver" && String(request.assignedDriver) !== String(req.user._id)) {
      return res.status(403).json({ error: "You can only update requests assigned to you." });
    }
    if (!canTransition(request.status, nextStatus)) {
      return res.status(409).json({ error: `A request cannot move from ${request.status} to ${nextStatus}.` });
    }
    if (nextStatus === "dispatched") return res.status(409).json({ error: "Use the dispatch action to assign a vehicle and driver." });
    const updatedAt = new Date();
    const update = {
      $set: { status: nextStatus },
      $push: { timeline: { status: nextStatus, at: updatedAt, actor: req.user._id, note: String(req.body.note || "").slice(0, 200) } },
    };
    if (nextStatus === "on-scene") update.$set.arrivedAt = updatedAt;
    if (nextStatus === "completed") update.$set.completedAt = updatedAt;
    const updatedRequest = await EmergencyRequest.findOneAndUpdate(
      { _id: request._id, status: request.status },
      update,
      { new: true, runValidators: true }
    );
    if (!updatedRequest) return res.status(409).json({ error: "The request status changed. Refresh and try again." });
    if ((nextStatus === "completed" || nextStatus === "cancelled") && updatedRequest.assignedAmbulance) {
      await Ambulance.updateOne({ _id: updatedRequest.assignedAmbulance, activeRequest: updatedRequest._id }, {
        $set: { status: "available", activeRequest: null, driver: null },
      });
    } else if (nextStatus === "on-scene" && updatedRequest.assignedAmbulance) {
      await Ambulance.updateOne({ _id: updatedRequest.assignedAmbulance, activeRequest: updatedRequest._id }, { $set: { status: "on-scene" } });
    }
    await updatedRequest.populate([
      { path: "assignedAmbulance", select: "callSign vehicle location status" },
      { path: "assignedDriver", select: "name phone" },
    ]);
    res.json({ request: updatedRequest });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
