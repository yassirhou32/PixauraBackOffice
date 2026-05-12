const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const express = require("express");
const User = require("../models/User");
const Client = require("../models/Client");
const { jwtSecret } = require("../config/env");

const router = express.Router();

router.post("/login", async (req, res) => {
  const { email, password } = req.body;
  const user = await User.findOne({ email: String(email).toLowerCase() });
  if (!user) return res.status(401).json({ message: "Identifiants invalides" });

  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) return res.status(401).json({ message: "Identifiants invalides" });

  const token = jwt.sign({ id: user._id, role: user.role, clientId: user.client }, jwtSecret, { expiresIn: "8h" });
  let client = null;
  if (user.client) client = await Client.findById(user.client);

  return res.json({
    token,
    user: {
      id: user._id,
      email: user.email,
      role: user.role,
      client,
    },
  });
});

module.exports = router;
