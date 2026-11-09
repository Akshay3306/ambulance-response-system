const express = require("express");
const Ambulance = require("../models/Ambulance");
const EmergencyRequest = require("../models/EmergencyRequest");
const User = require("../models/User");
const { authenticate, allowRoles } = require("../middleware/auth");

const router = express.Router();
router.use(authenticate);

router.get("/", async (req, res, next) => {
  try {
    let filter = {};
    if (req.user.role === "driver") filter = { driver: req.user._id };
    if (req.user.role === "requester") {
      const requests = await EmergencyRequest.find({
        "requester.userId": req.user._id,
        assignedAmbulance: { $ne: null },
      }).distinct("assignedAmbulance");
      filter = { _id: { $in: requests } };
    }
    const [ambulances, drivers, team] = await Promise.all([
      Ambulance.find(filter).sort({ callSign: 1 }).populate("driver", "name phone"),
      ["admin", "dispatcher"].includes(req.user.role) ? User.find({ role: "driver", active: true }).select("name phone licenseNumber") : [],
      req.user.role === "admin" ? User.find().select("name email phone role active licenseNumber").sort({ name: 1 }) : [],
    ]);
    res.json({ ambulances, drivers, team });
  } catch (error) {
    next(error);
  }
});

router.patch("/:id/location", allowRoles("admin", "dispatcher", "driver"), async (req, res, next) => {
  try {
    const lat = Number(req.body.lat);
    const lng = Number(req.body.lng);
    if (!Number.isFinite(lat) || lat < -90 || lat > 90 || !Number.isFinite(lng) || lng < -180 || lng > 180) {
      return res.status(400).json({ error: "Valid latitude and longitude are required." });
    }
    const filter = { _id: req.params.id };
    if (req.user.role === "driver") filter.driver = req.user._id;
    const ambulance = await Ambulance.findOneAndUpdate(filter, {
      $set: { location: { lat, lng, updatedAt: new Date() } },
    }, { new: true });
    if (!ambulance) return res.status(404).json({ error: "Ambulance not found or not assigned to you." });
    res.json({ ambulance });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
