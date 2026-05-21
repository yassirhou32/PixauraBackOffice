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

const CLIENT_TYPES = ["paire", "impaire", "vip"];

function parseClientBody(body, { requirePassword }) {
  const companyName = String(body.companyName || "").trim();
  const headOfficeAddress = String(body.headOfficeAddress || "").trim();
  const siret = String(body.siret || "").trim();
  const managerName = String(body.managerName || "").trim();
  const phone = String(body.phone || "").trim();
  const email = String(body.email || "").trim().toLowerCase();
  const clientType = String(body.clientType || "").trim();
  const password = String(body.password || "").trim();
  const notes = String(body.notes ?? "").trim();

  if (!companyName) return { error: "Le nom de l'entreprise est obligatoire." };
  if (!headOfficeAddress) return { error: "L'adresse du siege est obligatoire." };
  if (!siret) return { error: "Le SIRET est obligatoire." };
  if (!managerName) return { error: "Le nom du dirigeant / contact est obligatoire." };
  if (!phone) return { error: "Le telephone est obligatoire." };
  if (!email) return { error: "L'e-mail est obligatoire." };
  if (!CLIENT_TYPES.includes(clientType)) return { error: "La regle calendrier (P2C) est obligatoire." };
  if (requirePassword && !password) return { error: "Le mot de passe initial est obligatoire." };

  return {
    data: {
      companyName,
      headOfficeAddress,
      siret,
      managerName,
      phone,
      email,
      clientType,
      notes,
      password,
    },
  };
}

router.post("/", authRequired, roleRequired("admin"), async (req, res) => {
  const parsed = parseClientBody(req.body, { requirePassword: true });
  if (parsed.error) return res.status(400).json({ message: parsed.error });

  const { data } = parsed;
  const password = data.password;

  const client = await Client.create({
    companyName: data.companyName,
    headOfficeAddress: data.headOfficeAddress,
    siret: data.siret,
    managerName: data.managerName,
    phone: data.phone,
    email: data.email,
    clientType: data.clientType,
    notes: data.notes,
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
  const parsed = parseClientBody(req.body, { requirePassword: false });
  if (parsed.error) return res.status(400).json({ message: parsed.error });

  const { data } = parsed;
  const client = await Client.findByIdAndUpdate(
    req.params.id,
    {
      companyName: data.companyName,
      headOfficeAddress: data.headOfficeAddress,
      siret: data.siret,
      managerName: data.managerName,
      phone: data.phone,
      email: data.email,
      clientType: data.clientType,
      notes: data.notes,
    },
    { new: true, runValidators: true }
  );
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
