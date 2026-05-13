const path = require("path");
require("dotenv").config({ path: path.resolve(process.cwd(), ".env") });

module.exports = {
  port: process.env.PORT || 4000,
  mongoUri: process.env.MONGO_URI,
  jwtSecret: process.env.JWT_SECRET || "change_me_super_secret",
  adminEmail: process.env.ADMIN_EMAIL || "contact@pixaura.eu",
  adminPassword: process.env.ADMIN_PASSWORD || "pixaura1234@@",
  smtpHost: process.env.SMTP_HOST,
  smtpPort: Number(process.env.SMTP_PORT || 587),
  smtpUser: process.env.SMTP_USER,
  smtpPass: process.env.SMTP_PASS,
  /** Origine(s) du front pour CORS — trim pour éviter les espaces après = dans .env */
  frontendUrl: (process.env.FRONTEND_URL || "http://localhost:3000").trim(),
};
