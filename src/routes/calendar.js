const dayjs = require("dayjs");
const express = require("express");
const BlockedDate = require("../models/BlockedDate");
const BlockedSlot = require("../models/BlockedSlot");
const Client = require("../models/Client");
const Request = require("../models/Request");
const { authRequired, roleRequired } = require("../middleware/auth");
const { normalizeDateOnly, isWeekRuleAllowed } = require("../utils/calendarRules");
const {
  TIME_SLOTS,
  isValidSlotId,
  monthAvailabilityWithSlots,
  buildDaySlotsForClient,
  buildDaySlotsForAdmin,
  SLOT_LOCKING_STATUSES,
} = require("../utils/slotBooking");

const router = express.Router();

/** Demandes visibles sur la grille admin (toutes les « actives »). */
const ACTIVE = ["en_attente", "validee", "a_completer"];

router.get("/blocked", authRequired, async (_req, res) => {
  const blocked = await BlockedDate.find().sort({ date: 1 });
  res.json(blocked);
});

router.post("/blocked", authRequired, roleRequired("admin"), async (req, res) => {
  const date = normalizeDateOnly(req.body.date);
  const item = await BlockedDate.findOneAndUpdate(
    { date },
    { date, reason: req.body.reason || "indisponible", lockedByAdmin: true },
    { upsert: true, new: true }
  );
  res.status(201).json(item);
});

router.delete("/blocked/:id", authRequired, roleRequired("admin"), async (req, res) => {
  await BlockedDate.findByIdAndDelete(req.params.id);
  res.json({ message: "Date debloquee" });
});

router.get("/slot-definitions", authRequired, (_req, res) => {
  res.json({ slots: TIME_SLOTS });
});

router.post("/blocked-slots", authRequired, roleRequired("admin"), async (req, res) => {
  const date = normalizeDateOnly(req.body.date);
  const { slotId } = req.body;
  if (!isValidSlotId(slotId)) {
    return res.status(400).json({ message: "Creneau invalide." });
  }
  try {
    const item = await BlockedSlot.create({
      date,
      slotId,
      reason: req.body.reason || "indisponible",
      lockedByAdmin: true,
    });
    res.status(201).json(item);
  } catch (e) {
    if (e && e.code === 11000) {
      return res.status(409).json({ message: "Ce creneau est deja bloque pour ce jour." });
    }
    throw e;
  }
});

router.delete("/blocked-slots/:id", authRequired, roleRequired("admin"), async (req, res) => {
  await BlockedSlot.findByIdAndDelete(req.params.id);
  res.json({ message: "Creneau debloque" });
});

router.get("/blocked-slots", authRequired, roleRequired("admin"), async (_req, res) => {
  const items = await BlockedSlot.find().sort({ date: 1, slotId: 1 });
  const labelById = new Map(TIME_SLOTS.map((s) => [s.id, s.label]));
  res.json(
    items.map((doc) => ({
      _id: doc._id,
      date: doc.date,
      slotId: doc.slotId,
      slotLabel: labelById.get(doc.slotId) || doc.slotId,
      reason: doc.reason || "",
    }))
  );
});

router.get("/admin/day-slots", authRequired, roleRequired("admin"), async (req, res) => {
  const dateRaw = req.query.date;
  if (!dateRaw) return res.status(400).json({ message: "Parametre date requis." });
  const dateKey = dayjs(dateRaw).format("YYYY-MM-DD");
  const requestedDate = normalizeDateOnly(dateRaw);

  const [blockedDates, blockedSlots, requests] = await Promise.all([
    BlockedDate.find(),
    BlockedSlot.find({ date: requestedDate }),
    Request.find({ requestedDate, status: { $in: ACTIVE } })
      .populate("client", "companyName email")
      .select("requestedDate timeSlotId requestedTime status client company"),
  ]);

  const requestsJson = requests.map((r) => ({
    ...r.toObject(),
    company: r.company || r.client?.companyName || "",
  }));

  const payload = buildDaySlotsForAdmin({
    dateKey,
    blockedDateDocs: blockedDates,
    blockedSlotDocs: blockedSlots,
    requests: requestsJson,
  });
  res.json({ ...payload, slotDefinitions: TIME_SLOTS });
});

router.get("/day-slots", authRequired, roleRequired("client"), async (req, res) => {
  const dateRaw = req.query.date;
  if (!dateRaw) return res.status(400).json({ message: "Parametre date requis." });
  const dateKey = dayjs(dateRaw).format("YYYY-MM-DD");
  const requestedDate = normalizeDateOnly(dateRaw);

  const [client, blockedDates, blockedSlots, requests] = await Promise.all([
    Client.findById(req.user.clientId),
    BlockedDate.find(),
    BlockedSlot.find({ date: requestedDate }),
    Request.find({ requestedDate, status: { $in: SLOT_LOCKING_STATUSES } }).select(
      "requestedDate timeSlotId requestedTime status client"
    ),
  ]);

  if (!client) return res.status(404).json({ message: "Client introuvable" });

  const weekOk = isWeekRuleAllowed({
    date: requestedDate,
    clientType: client.clientType,
  });

  if (!weekOk) {
    return res.json({
      date: dateKey,
      allowedByProfile: false,
      fullDayBlocked: false,
      slots: TIME_SLOTS.map((def) => ({
        id: def.id,
        label: def.label,
        startTime: def.startTime,
        endTime: def.endTime,
        available: false,
        reason: "profil",
      })),
      slotDefinitions: TIME_SLOTS,
    });
  }

  const payload = buildDaySlotsForClient({
    dateKey,
    blockedDateDocs: blockedDates,
    blockedSlotDocs: blockedSlots,
    requests,
  });
  res.json({ ...payload, allowedByProfile: true, slotDefinitions: TIME_SLOTS });
});

router.get("/availability", authRequired, roleRequired("client"), async (req, res) => {
  const month = Number(req.query.month || dayjs().month() + 1);
  const year = Number(req.query.year || dayjs().year());

  const monthStart = dayjs(`${year}-${String(month).padStart(2, "0")}-01`).startOf("day").toDate();
  const monthEnd = dayjs(monthStart).endOf("month").toDate();

  const [client, blockedDates, blockedSlots, requests] = await Promise.all([
    Client.findById(req.user.clientId),
    BlockedDate.find(),
    BlockedSlot.find({ date: { $gte: monthStart, $lte: monthEnd } }),
    Request.find({
      requestedDate: { $gte: monthStart, $lte: monthEnd },
      status: { $in: SLOT_LOCKING_STATUSES },
    }).select("requestedDate timeSlotId requestedTime status client"),
  ]);

  if (!client) return res.status(404).json({ message: "Client introuvable" });

  const dates = monthAvailabilityWithSlots({
    month,
    year,
    clientType: client.clientType,
    blockedDates,
    blockedSlots,
    requests,
  });
  res.json({ month, year, dates, slotDefinitions: TIME_SLOTS });
});

module.exports = router;
