const jwt = require("jsonwebtoken");
const { jwtSecret } = require("../config/env");

function authRequired(req, res, next) {
  const token = req.headers.authorization?.replace("Bearer ", "");
  if (!token) return res.status(401).json({ message: "Token requis" });

  try {
    req.user = jwt.verify(token, jwtSecret);
    next();
  } catch {
    return res.status(401).json({ message: "Token invalide" });
  }
}

function roleRequired(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) return res.status(403).json({ message: "Acces refuse" });
    next();
  };
}

module.exports = { authRequired, roleRequired };
