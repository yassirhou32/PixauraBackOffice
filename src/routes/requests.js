const express = require("express");
const dayjs = require("dayjs");
const Request = require("../models/Request");
const Client = require("../models/Client");
const BlockedDate = require("../models/BlockedDate");
const BlockedSlot = require("../models/BlockedSlot");
const { authRequired, roleRequired } = require("../middleware/auth");
const { normalizeDateOnly, isClientDateAllowed, isPastDate } = require("../utils/calendarRules");
const {
  isValidSlotId,
  startTimeForSlot,
  occupiedSlotsForDate,
  dateKeyFromInput,
  SLOT_LOCKING_STATUSES,
} = require("../utils/slotBooking");
const router = express.Router();

router.get("/", authRequired, roleRequired("admin"), async (req, res) => {
  const filter = {};
  if (req.query.status) filter.status = req.query.status;
  if (req.query.clientId) filter.client = req.query.clientId;

  if (req.query.from || req.query.to) {
    filter.requestedDate = {};
    if (req.query.from) filter.requestedDate.$gte = dayjs(req.query.from).startOf("day").toDate();
    if (req.query.to) filter.requestedDate.$lte = dayjs(req.query.to).endOf("day").toDate();
  }

  const sortSpec = req.query.from && req.query.to ? { requestedDate: 1, requestedTime: 1 } : { createdAt: -1 };
  const requests = await Request.find(filter).populate("client").sort(sortSpec);

  const byType = req.query.clientType
    ? requests.filter((r) => r.client?.clientType === req.query.clientType)
    : requests;

  res.json(byType);
});

router.get("/me", authRequired, roleRequired("client"), async (req, res) => {
  const requests = await Request.find({ client: req.user.clientId }).sort({ createdAt: -1 });
  res.json(requests);
});

router.get("/:id", authRequired, async (req, res) => {
  const request = await Request.findById(req.params.id).populate("client");
  if (!request) return res.status(404).json({ message: "Demande introuvable" });

  if (req.user.role === "client" && String(request.client._id) !== String(req.user.clientId)) {
    return res.status(403).json({ message: "Acces refuse" });
  }

  res.json(request);
});

router.post("/", authRequired, roleRequired("client"), async (req, res) => {
  const client = await Client.findById(req.user.clientId);
  if (!client) return res.status(404).json({ message: "Client introuvable" });

  const { timeSlotId } = req.body;
  if (!timeSlotId || !isValidSlotId(timeSlotId)) {
    return res.status(400).json({ message: "Choisissez un creneau parmi les 5 plages horaires." });
  }

  const blockedDates = await BlockedDate.find();
  const requestedDate = normalizeDateOnly(req.body.requestedDate);
  const dateKey = dateKeyFromInput(requestedDate);

  if (isPastDate(requestedDate)) {
    return res.status(400).json({ message: "Impossible de reserver une date passee." });
  }

  const allowed = isClientDateAllowed({ date: requestedDate, clientType: client.clientType, blockedDates });
  if (!allowed) {
    return res.status(400).json({ message: "Cette date est indisponible pour votre profil." });
  }

  const blockedSlot = await BlockedSlot.findOne({ date: requestedDate, slotId: timeSlotId });
  if (blockedSlot) {
    return res.status(400).json({ message: "Ce creneau est bloque par l'administrateur." });
  }

  const sameDayValidated = await Request.find({
    requestedDate,
    status: { $in: SLOT_LOCKING_STATUSES },
  }).select("requestedDate timeSlotId requestedTime status");
  if (occupiedSlotsForDate(sameDayValidated, dateKey).has(timeSlotId)) {
    return res.status(400).json({ message: "Ce creneau est deja reserve." });
  }

  const requestedTime = startTimeForSlot(timeSlotId);

  const created = await Request.create({
    ...req.body,
    requestedDate,
    requestedTime,
    timeSlotId,
    client: client._id,
    company: req.body.company || client.companyName,
    email: req.body.email || client.email,
    phone: req.body.phone || client.phone,
  });

  res.status(201).json(created);
});

const STATUS_ENUM = ["en_attente", "validee", "refusee", "a_completer"];

router.patch("/:id/status", authRequired, roleRequired("admin"), async (req, res) => {
  const nextStatus = String(req.body.status || "").trim();
  if (!STATUS_ENUM.includes(nextStatus)) {
    return res.status(400).json({ message: "Statut invalide." });
  }

  const request = await Request.findByIdAndUpdate(
    req.params.id,
    { status: nextStatus },
    { new: true, runValidators: true }
  ).populate("client", "email companyName");

  if (!request) return res.status(404).json({ message: "Demande introuvable" });
  res.json(request);
});

module.exports = router;
