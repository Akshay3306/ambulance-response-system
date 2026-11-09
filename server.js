require("dotenv").config();

const path = require("node:path");
const express = require("express");
const helmet = require("helmet");
const cookieParser = require("cookie-parser");
const mongoose = require("mongoose");

const app = express();
const port = Number(process.env.PORT) || 3000;

app.disable("x-powered-by");
if (process.env.TRUST_PROXY === "1") app.set("trust proxy", 1);
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:"],
      connectSrc: ["'self'"],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      frameAncestors: ["'none'"],
    },
  },
}));
app.use(express.json({ limit: "32kb" }));
app.use("/api", (req, res, next) => {
  if (["POST", "PUT", "PATCH"].includes(req.method) && (!req.body || typeof req.body !== "object" || Array.isArray(req.body))) {
    return res.status(400).json({ error: "Request body must be a JSON object." });
  }
  next();
});
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
app.use((err, _req, res, next) => {
  console.error(err);
  if (res.headersSent) return next(err);
  res.status(err.status || 500).json({
    error: err.status ? err.message : "An unexpected server error occurred.",
  });
});

async function start() {
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 24) {
    throw new Error("JWT_SECRET must be set to at least 24 characters.");
  }
  const mongoUri = process.env.MONGODB_URI || (process.env.NODE_ENV === "production" ? "" : "mongodb://localhost:27017/rapid_response_ems");
  if (!mongoUri) throw new Error("MONGODB_URI must be set in production.");
  await mongoose.connect(mongoUri, {
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
