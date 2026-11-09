const express = require("express");
const Ambulance = require("../models/Ambulance");
const EmergencyRequest = require("../models/EmergencyRequest");
const User = require("../models/User");
const { authenticate, allowRoles } = require("../middleware/auth");

const router = express.Router();
router.use(authenticate, allowRoles("admin", "dispatcher"));

function dateFilter(query) {
  const filter = {};
  for (const [key, operator] of [["from", "$gte"], ["to", "$lte"]]) {
    if (query[key] === undefined) continue;
    if (typeof query[key] !== "string" || !/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2}))?$/.test(query[key])) {
      const error = new Error(`The ${key} date must be a valid ISO date.`);
      error.status = 400;
      throw error;
    }
    const date = new Date(query[key]);
    if (Number.isNaN(date.getTime()) || new Date(`${query[key].slice(0, 10)}T00:00:00.000Z`).toISOString().slice(0, 10) !== query[key].slice(0, 10)) {
      const error = new Error(`The ${key} date must be a valid ISO date.`);
      error.status = 400;
      throw error;
    }
    filter[operator] = date;
  }
  if (filter.$gte && filter.$lte && filter.$gte > filter.$lte) {
    const error = new Error("The start date must be before the end date.");
    error.status = 400;
    throw error;
  }
  return Object.keys(filter).length ? { createdAt: filter } : {};
}

router.get("/requests", async (req, res, next) => {
  try {
    const report = await EmergencyRequest.aggregate([
      { $match: dateFilter(req.query) },
      { $group: { _id: { status: "$status", emergencyType: "$emergencyType" }, count: { $sum: 1 } } },
      { $sort: { "_id.status": 1, "_id.emergencyType": 1 } },
    ]);
    res.json({ report });
  } catch (error) {
    next(error);
  }
});

router.get("/utilization", async (req, res, next) => {
  try {
    const [fleet, totals, usage] = await Promise.all([
      Ambulance.aggregate([
        { $lookup: { from: "users", localField: "driver", foreignField: "_id", as: "driverInfo" } },
        { $unwind: { path: "$driverInfo", preserveNullAndEmptyArrays: true } },
        { $project: { callSign: 1, vehicle: 1, station: 1, status: 1, driver: "$driverInfo.name" } },
        { $sort: { callSign: 1 } },
      ]),
      EmergencyRequest.aggregate([
        { $match: dateFilter(req.query) },
        { $group: { _id: null, total: { $sum: 1 }, assigned: { $sum: { $cond: [{ $ne: ["$assignedAmbulance", null] }, 1, 0] } } } },
      ]),
      EmergencyRequest.aggregate([
        { $match: { ...dateFilter(req.query), assignedAmbulance: { $ne: null } } },
        { $group: { _id: "$assignedAmbulance", trips: { $sum: 1 } } },
      ]),
    ]);
    const trips = new Map(usage.map((item) => [String(item._id), item.trips]));
    res.json({
      fleet: fleet.map((unit) => ({ ...unit, trips: trips.get(String(unit._id)) || 0 })),
      totals: totals[0] || { total: 0, assigned: 0 },
    });
  } catch (error) {
    next(error);
  }
});

router.get("/response-times", async (req, res, next) => {
  try {
    const [result] = await EmergencyRequest.aggregate([
      { $match: { ...dateFilter(req.query), dispatchedAt: { $ne: null }, arrivedAt: { $ne: null } } },
      { $project: { requestNumber: 1, emergencyType: 1, priority: 1, dispatchedAt: 1, arrivedAt: 1, minutes: { $divide: [{ $subtract: ["$arrivedAt", "$dispatchedAt"] }, 60000] } } },
      {
        $facet: {
          report: [{ $sort: { arrivedAt: -1 } }, { $limit: 100 }],
          summary: [{ $group: { _id: null, avgMinutes: { $avg: "$minutes" }, total: { $sum: 1 } } }],
        },
      },
    ]);
    const summary = result.summary[0] || { avgMinutes: null, total: 0 };
    res.json({ report: result.report, avgMinutes: summary.avgMinutes, total: summary.total });
  } catch (error) {
    next(error);
  }
});

router.get("/driver-activity", async (req, res, next) => {
  try {
    const report = await EmergencyRequest.aggregate([
      { $match: { ...dateFilter(req.query), assignedDriver: { $ne: null } } },
      { $group: { _id: "$assignedDriver", assigned: { $sum: 1 }, completed: { $sum: { $cond: [{ $eq: ["$status", "completed"] }, 1, 0] } }, active: { $sum: { $cond: [{ $in: ["$status", ["dispatched", "en-route", "on-scene", "picked-up", "transporting"]] }, 1, 0] } } } },
      { $lookup: { from: "users", localField: "_id", foreignField: "_id", as: "driver" } },
      { $unwind: "$driver" },
      { $project: { driver: "$driver.name", assigned: 1, completed: 1, active: 1 } },
      { $sort: { completed: -1 } },
    ]);
    res.json({ report });
  } catch (error) {
    next(error);
  }
});

router.get("/summary", async (req, res, next) => {
  try {
    const match = dateFilter(req.query);
    const [requests, fleetCount, driverCount, recent] = await Promise.all([
      EmergencyRequest.aggregate([
        { $match: match },
        { $group: { _id: null, total: { $sum: 1 }, active: { $sum: { $cond: [{ $in: ["$status", ["pending", "dispatched", "en-route", "on-scene", "picked-up", "transporting"]] }, 1, 0] } }, completed: { $sum: { $cond: [{ $eq: ["$status", "completed"] }, 1, 0] } } } },
      ]),
      Ambulance.countDocuments(),
      User.countDocuments({ role: "driver", active: true }),
      EmergencyRequest.find(match).sort({ createdAt: -1 }).limit(5).select("requestNumber status priority emergencyType pickup createdAt"),
    ]);
    const available = await Ambulance.countDocuments({ status: "available" });
    res.json({ requests: requests[0] || { total: 0, active: 0, completed: 0 }, fleetCount, driverCount, available, recent });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
