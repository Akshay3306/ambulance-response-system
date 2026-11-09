require("dotenv").config();

const path = require("node:path");
const express = require("express");
const helmet = require("helmet");
const cookieParser = require("cookie-parser");
const mongoose = require("mongoose");

const app = express();
const port = Number(process.env.PORT) || 3000;

app.disable("x-powered-by");
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: "32kb" }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, "public")));

app.get("/api/health", (_req, res) => {
  const ready = mongoose.connection.readyState === 1;
  res.status(ready ? 200 : 503).json({
    status: ready ? "ok" : "starting",
    database: ready ? "connected" : "disconnected",
  });
});

app.use("/api/auth", require("./src/routes/auth"));
app.use("/api/requests", require("./src/routes/requests"));
app.use("/api/fleet", require("./src/routes/fleet"));
app.use("/api/reports", require("./src/routes/reports"));

app.use("/api", (_req, res) => res.status(404).json({ error: "API endpoint not found." }));
app.use((err, _req, res, _next) => {
  console.error(err);
  if (res.headersSent) return;
  res.status(err.status || 500).json({
    error: err.status ? err.message : "An unexpected server error occurred.",
  });
});

async function start() {
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 24) {
    throw new Error("JWT_SECRET must be set to at least 24 characters.");
  }
  await mongoose.connect(process.env.MONGODB_URI || "mongodb://localhost:27017/rapid_response_ems", {
    serverSelectionTimeoutMS: 10000,
  });
  app.listen(port, "0.0.0.0", () => console.log(`Rapid Response EMS listening on port ${port}`));
}

if (require.main === module) {
  start().catch((error) => {
    console.error("Unable to start Rapid Response EMS:", error.message);
    process.exitCode = 1;
  });
}

module.exports = app;
