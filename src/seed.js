require("dotenv").config();

const bcrypt = require("bcryptjs");
const mongoose = require("mongoose");
const User = require("./models/User");
const Ambulance = require("./models/Ambulance");
const EmergencyRequest = require("./models/EmergencyRequest");

const users = [
  { name: "Alex Morgan", email: "admin@rapidresponse.local", password: "Admin123!", phone: "+1 555 0101", role: "admin" },
  { name: "Jordan Lee", email: "dispatch@rapidresponse.local", password: "Dispatch123!", phone: "+1 555 0102", role: "dispatcher" },
  { name: "Sam Rivera", email: "driver@rapidresponse.local", password: "Driver123!", phone: "+1 555 0111", role: "driver", licenseNumber: "EMT-2048" },
  { name: "Taylor Brooks", email: "driver2@rapidresponse.local", password: "Driver123!", phone: "+1 555 0112", role: "driver", licenseNumber: "EMT-3190" },
  { name: "Casey Patel", email: "requester@rapidresponse.local", password: "Request123!", phone: "+1 555 0199", role: "requester" },
];

async function seed() {
  if (!process.env.MONGODB_URI) throw new Error("Set MONGODB_URI before seeding.");
  await mongoose.connect(process.env.MONGODB_URI);
  const savedUsers = {};
  for (const entry of users) {
    const passwordHash = await bcrypt.hash(entry.password, 12);
    savedUsers[entry.role + (entry.email.includes("2@") ? "2" : "")] = await User.findOneAndUpdate(
      { email: entry.email },
      { $set: { name: entry.name, passwordHash, phone: entry.phone, role: entry.role, active: true, licenseNumber: entry.licenseNumber || "" } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
  }
  const fleet = [
    { callSign: "MED-01", vehicle: "Mercedes Sprinter · ALS", station: "Central Station", status: "available", driver: null, location: { lat: 17.385, lng: 78.4867 } },
    { callSign: "MED-02", vehicle: "Ford Transit · BLS", station: "North Station", status: "available", driver: null, location: { lat: 17.405, lng: 78.475 } },
    { callSign: "MED-03", vehicle: "Toyota HiAce · ALS", station: "South Station", status: "maintenance", driver: null, location: { lat: 17.365, lng: 78.495 } },
    { callSign: "MED-04", vehicle: "Mercedes Sprinter · ALS", station: "East Station", status: "available", driver: null, location: { lat: 17.39, lng: 78.515 } },
  ];
  for (const ambulance of fleet) {
    await Ambulance.findOneAndUpdate({ callSign: ambulance.callSign }, { $setOnInsert: ambulance }, { upsert: true, new: true, setDefaultsOnInsert: true });
  }
  const count = await EmergencyRequest.countDocuments();
  if (!count) {
    await EmergencyRequest.create([
      {
        requestNumber: "EMS-240618-01", requester: { userId: savedUsers.requester._id, name: "Casey Patel", phone: "+1 555 0199" },
        patientName: "R. Patel", emergencyType: "cardiac", priority: "critical", notes: "Chest pain, conscious.",
        pickup: { address: "Banjara Hills Rd 12, Hyderabad", lat: 17.412, lng: 78.448 },
        status: "pending", timeline: [{ status: "pending", at: new Date(Date.now() - 3 * 60000), note: "Emergency request received" }],
      },
      {
        requestNumber: "EMS-240618-02", requester: { name: "Maya Chen", phone: "+1 555 0187" }, patientName: "Maya Chen",
        emergencyType: "trauma", priority: "high", pickup: { address: "Jubilee Hills, Hyderabad", lat: 17.431, lng: 78.407 },
        status: "en-route", assignedAmbulance: (await Ambulance.findOne({ callSign: "MED-02" }))._id, assignedDriver: savedUsers.driver2._id,
        dispatchedAt: new Date(Date.now() - 12 * 60000), estimatedMinutes: 6,
        timeline: [{ status: "pending", at: new Date(Date.now() - 16 * 60000) }, { status: "dispatched", at: new Date(Date.now() - 12 * 60000) }, { status: "en-route", at: new Date(Date.now() - 9 * 60000) }],
      },
      {
        requestNumber: "EMS-240617-08", requester: { name: "Robin Silva", phone: "+1 555 0162" }, emergencyType: "medical", priority: "standard",
        pickup: { address: "Madhapur, Hyderabad", lat: 17.448, lng: 78.391 }, status: "completed",
        dispatchedAt: new Date(Date.now() - 4 * 60 * 60000), arrivedAt: new Date(Date.now() - 3.8 * 60 * 60000), completedAt: new Date(Date.now() - 3 * 60 * 60000),
        assignedDriver: savedUsers.driver._id, timeline: [{ status: "completed", at: new Date(Date.now() - 3 * 60 * 60000) }],
      },
    ]);
    await Ambulance.updateOne({ callSign: "MED-02" }, { $set: { status: "assigned", driver: savedUsers.driver2._id, activeRequest: (await EmergencyRequest.findOne({ requestNumber: "EMS-240618-02" }))._id } });
  }
  console.log("Seed complete. Demo logins:");
  for (const entry of users) console.log(`  ${entry.role.padEnd(10)} ${entry.email} / ${entry.password}`);
  await mongoose.disconnect();
}

seed().catch(async (error) => {
  console.error("Seed failed:", error.message);
  await mongoose.disconnect();
  process.exitCode = 1;
});
