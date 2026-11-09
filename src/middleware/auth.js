const jwt = require("jsonwebtoken");
const User = require("../models/User");

async function authenticate(req, res, next) {
  const token = req.cookies.rr_token || req.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return res.status(401).json({ error: "Please sign in to continue." });
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(payload.sub).select("-passwordHash");
    if (!user || !user.active) return res.status(401).json({ error: "Your account is unavailable." });
    req.user = user;
    next();
  } catch (error) {
    if (error.name === "TokenExpiredError" || error.name === "JsonWebTokenError") {
      return res.status(401).json({ error: "Your session has expired. Please sign in again." });
    }
    next(error);
  }
}

function allowRoles(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) return res.status(403).json({ error: "You do not have permission to do that." });
    next();
  };
}

module.exports = { authenticate, allowRoles };
