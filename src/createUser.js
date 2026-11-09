require("dotenv").config();

const bcrypt = require("bcryptjs");
const mongoose = require("mongoose");
const Ambulance = require("./models/Ambulance");
const User = require("./models/User");

const fleet = [
  { callSign: "MED-01", vehicle: "Mercedes Sprinter · ALS", station: "Central Station", location: { lat: 17.385, lng: 78.4867 } },
  { callSign: "MED-02", vehicle: "Ford Transit · BLS", station: "North Station", location: { lat: 17.405, lng: 78.475 } },
  { callSign: "MED-03", vehicle: "Toyota HiAce · ALS", station: "South Station", location: { lat: 17.365, lng: 78.495 } },
  { callSign: "MED-04", vehicle: "Mercedes Sprinter · ALS", station: "East Station", location: { lat: 17.39, lng: 78.515 } },
];

async function createUser() {
  const { USER_NAME, USER_EMAIL, USER_PASSWORD, USER_ROLE } = process.env;
  const roles = ["admin", "dispatcher", "driver", "requester"];
  if (!process.env.MONGODB_URI) throw new Error("Set MONGODB_URI to the target database.");
  if (!USER_NAME?.trim() || USER_NAME.trim().length > 100) throw new Error("Set USER_NAME (1–100 characters).");
  if (!USER_EMAIL || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(USER_EMAIL)) throw new Error("Set a valid USER_EMAIL.");
  if (!USER_PASSWORD || USER_PASSWORD.length < 12) throw new Error("Set USER_PASSWORD to a unique password of at least 12 characters.");
  if (!roles.includes(USER_ROLE)) throw new Error(`Set USER_ROLE to one of: ${roles.join(", ")}.`);

  await mongoose.connect(process.env.MONGODB_URI);
  const existing = await User.findOne({ email: USER_EMAIL.trim().toLowerCase() }).select("_id");
  if (existing) throw new Error("An account already uses this email; no user or password was changed.");

  await User.create({
    name: USER_NAME.trim(),
    email: USER_EMAIL.trim().toLowerCase(),
    passwordHash: await bcrypt.hash(USER_PASSWORD, 12),
    role: USER_ROLE,
  });

  for (const unit of fleet) {
    await Ambulance.updateOne({ callSign: unit.callSign }, { $setOnInsert: unit }, { upsert: true });
  }
  console.log(`Created ${USER_ROLE} account ${USER_EMAIL.trim().toLowerCase()} and ensured the starter fleet exists.`);
  await mongoose.disconnect();
}

createUser().catch(async (error) => {
  console.error("User provisioning failed:", error.message);
  await mongoose.disconnect();
  process.exitCode = 1;
});
