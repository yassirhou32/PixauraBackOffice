const express = require("express");
const Client = require("../models/Client");
const Request = require("../models/Request");
const { authRequired, roleRequired } = require("../middleware/auth");

const router = express.Router();

router.get("/dashboard", authRequired, roleRequired("admin"), async (_req, res) => {
  const [total, en_attente, validee, refusee, clientsActifs] = await Promise.all([
    Request.countDocuments(),
    Request.countDocuments({ status: "en_attente" }),
    Request.countDocuments({ status: "validee" }),
    Request.countDocuments({ status: "refusee" }),
    Client.countDocuments({ isActive: true }),
  ]);

  res.json({ total, en_attente, validee, refusee, clientsActifs });
});

module.exports = router;
