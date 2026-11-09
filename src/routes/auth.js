const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const rateLimit = require("express-rate-limit");
const User = require("../models/User");
const { authenticate } = require("../middleware/auth");

const router = express.Router();
const loginLimit = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: true, legacyHeaders: false });

router.post("/login", loginLimit, async (req, res, next) => {
  try {
    const email = String(req.body.email || "").trim().toLowerCase();
    const password = String(req.body.password || "");
    if (!email || !password) return res.status(400).json({ error: "Email and password are required." });
    const user = await User.findOne({ email }).select("+passwordHash");
    if (!user || !user.active || !(await bcrypt.compare(password, user.passwordHash))) {
      return res.status(401).json({ error: "Email or password is incorrect." });
    }
    const token = jwt.sign({ sub: user.id }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || "8h" });
    res.cookie("rr_token", token, {
      httpOnly: true,
      sameSite: "strict",
      secure: process.env.COOKIE_SECURE === "true",
      maxAge: 8 * 60 * 60 * 1000,
    });
    res.json({ user: publicUser(user) });
  } catch (error) {
    next(error);
  }
});

router.get("/me", authenticate, (req, res) => res.json({ user: publicUser(req.user) }));
router.post("/logout", (_req, res) => {
  res.clearCookie("rr_token", { httpOnly: true, sameSite: "strict", secure: process.env.COOKIE_SECURE === "true" });
  res.status(204).end();
});

function publicUser(user) {
  return { id: user.id, name: user.name, email: user.email, phone: user.phone, role: user.role, licenseNumber: user.licenseNumber };
}

module.exports = router;
