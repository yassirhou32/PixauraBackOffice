const bcrypt = require("bcryptjs");
const User = require("./models/User");
const { adminEmail, adminPassword } = require("./config/env");

async function seedAdmin() {
  const existing = await User.findOne({ email: adminEmail.toLowerCase() });
  if (existing) return;
  const passwordHash = await bcrypt.hash(adminPassword, 10);
  await User.create({ email: adminEmail.toLowerCase(), passwordHash, role: "admin" });
  console.log("Admin initial cree:", adminEmail);
}

module.exports = { seedAdmin };
