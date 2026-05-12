const cors = require("cors");
const express = require("express");
const { frontendUrl } = require("./config/env");

const authRoutes = require("./routes/auth");
const clientRoutes = require("./routes/clients");
const adminRoutes = require("./routes/admin");
const requestRoutes = require("./routes/requests");
const calendarRoutes = require("./routes/calendar");

const app = express();

const corsOrigins =
  typeof frontendUrl === "string" && frontendUrl.includes(",")
    ? frontendUrl.split(",").map((s) => s.trim()).filter(Boolean)
    : [frontendUrl].filter(Boolean);

app.use(
  cors({
    origin: corsOrigins.length <= 1 ? corsOrigins[0] || true : corsOrigins,
  })
);
app.use(express.json());

app.get("/api/health", (_req, res) => res.json({ ok: true }));

app.use("/api/auth", authRoutes);
app.use("/api/clients", clientRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/requests", requestRoutes);
app.use("/api/calendar", calendarRoutes);

module.exports = app;
