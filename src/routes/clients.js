const bcrypt = require("bcryptjs");
const express = require("express");
const Client = require("../models/Client");
const User = require("../models/User");
const Request = require("../models/Request");
const { authRequired, roleRequired } = require("../middleware/auth");
const { sendCredentialsEmail } = require("../utils/mailer");

const router = express.Router();

router.get("/", authRequired, roleRequired("admin"), async (_req, res) => {
  const clients = await Client.find().sort({ createdAt: -1 });
  res.json(clients);
});

router.post("/", authRequired, roleRequired("admin"), async (req, res) => {
  const password = req.body.password || Math.random().toString(36).slice(-10);
  const client = await Client.create({
    companyName: req.body.companyName,
    headOfficeAddress: req.body.headOfficeAddress,
    siret: req.body.siret,
    managerName: req.body.managerName,
    phone: req.body.phone,
    email: String(req.body.email).toLowerCase(),
    clientType: req.body.clientType,
    notes: req.body.notes,
  });

  const passwordHash = await bcrypt.hash(password, 10);
  await User.create({ email: client.email, passwordHash, role: "client", client: client._id });

  let emailStatus = { sent: false, reason: "non tente" };
  try {
    emailStatus = await sendCredentialsEmail({ to: client.email, password });
  } catch (error) {
    emailStatus = { sent: false, reason: error.message };
  }

  res.status(201).json({ client, emailStatus, temporaryPassword: password });
});

router.put("/:id", authRequired, roleRequired("admin"), async (req, res) => {
  const client = await Client.findByIdAndUpdate(req.params.id, req.body, { new: true });
  if (!client) return res.status(404).json({ message: "Client introuvable" });
  res.json(client);
});

router.delete("/:id", authRequired, roleRequired("admin"), async (req, res) => {
  const client = await Client.findByIdAndDelete(req.params.id);
  if (!client) return res.status(404).json({ message: "Client introuvable" });
  await User.deleteOne({ client: req.params.id });
  const deletedRequests = await Request.deleteMany({ client: req.params.id });
  res.json({ message: "Client supprime", deletedRequests: deletedRequests.deletedCount || 0 });
});

module.exports = router;
