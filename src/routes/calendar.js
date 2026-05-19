const dayjs = require("dayjs");
const express = require("express");
const BlockedDate = require("../models/BlockedDate");
const BlockedSlot = require("../models/BlockedSlot");
const ClientMonthAccess = require("../models/ClientMonthAccess");
const {
  isClientMonthOpen,
  rollingMonthsFromNow,
  monthLabelFr: clientMonthLabelFr,
  defaultOpenForClients,
} = require("../utils/clientMonthAccess");
const Client = require("../models/Client");
const Request = require("../models/Request");
const { authRequired, roleRequired } = require("../middleware/auth");
const { normalizeDateOnly, isWeekRuleAllowed, isPastDate } = require("../utils/calendarRules");
const {
  TIME_SLOTS,
  isValidSlotId,
  monthAvailabilityWithSlots,
  buildDaySlotsForClient,
  buildDaySlotsForAdmin,
  SLOT_LOCKING_STATUSES,
} = require("../utils/slotBooking");
const {
  P2C_COUNTING_STATUSES,
  getP2cMonthState,
  validateP2cBooking,
  monthBounds,
} = require("../utils/p2cQuota");

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

/** Admin : liste des mois (roulant) avec état ouvert / fermé pour les clients */
router.get("/client-month-access", authRequired, roleRequired("admin"), async (req, res) => {
  const count = Math.min(24, Math.max(1, Number(req.query.count) || 12));
  const months = rollingMonthsFromNow(count);
  const years = [...new Set(months.map((m) => m.year))];
  const rows = await ClientMonthAccess.find({ year: { $in: years } });
  const items = months.map(({ year, month }) => {
    const row = rows.find((r) => r.year === year && r.month === month);
    const openForClients = row ? row.openForClients : defaultOpenForClients(year, month);
    return {
      year,
      month,
      label: clientMonthLabelFr(month, year),
      openForClients,
      isCurrentMonth: year === dayjs().year() && month === dayjs().month() + 1,
      recordId: row ? String(row._id) : null,
    };
  });
  res.json({ items });
});

/** Admin : ouvrir ou fermer un mois pour tous les clients */
router.put("/client-month-access", authRequired, roleRequired("admin"), async (req, res) => {
  const year = Number(req.body.year);
  const month = Number(req.body.month);
  const openForClients = Boolean(req.body.openForClients);
  if (!year || month < 1 || month > 12) {
    return res.status(400).json({ message: "Mois ou annee invalide." });
  }
  const item = await ClientMonthAccess.findOneAndUpdate(
    { year, month },
    { year, month, openForClients },
    { upsert: true, new: true }
  );
  res.json({
    year: item.year,
    month: item.month,
    label: clientMonthLabelFr(item.month, item.year),
    openForClients: item.openForClients,
  });
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
  const excludeRequestId = req.query.excludeRequestId ? String(req.query.excludeRequestId) : undefined;
  const dateKey = dayjs(dateRaw).format("YYYY-MM-DD");
  const requestedDate = normalizeDateOnly(dateRaw);

  const month = dayjs(requestedDate).month() + 1;
  const year = dayjs(requestedDate).year();
  const { monthStart, monthEnd } = monthBounds(month, year);

  const [client, blockedDates, blockedSlots, requests, clientMonthRequests] = await Promise.all([
    Client.findById(req.user.clientId),
    BlockedDate.find(),
    BlockedSlot.find({ date: requestedDate }),
    Request.find({ requestedDate, status: { $in: SLOT_LOCKING_STATUSES } }).select(
      "requestedDate timeSlotId requestedTime status client"
    ),
    Request.find({
      client: req.user.clientId,
      requestedDate: { $gte: monthStart, $lte: monthEnd },
      status: { $in: P2C_COUNTING_STATUSES },
    }).select("_id requestedDate status isFullDay timeSlotId"),
  ]);

  if (!client) return res.status(404).json({ message: "Client introuvable" });

  const accessRows = await ClientMonthAccess.find({
    $or: [{ year }, { year: year - 1 }, { year: year + 1 }],
  });
  if (!isClientMonthOpen(year, month, accessRows)) {
    return res.json({
      date: dateKey,
      allowedByProfile: false,
      clientMonthClosed: true,
      fullDayAvailable: false,
      fullDayBlocked: false,
      slots: TIME_SLOTS.map((def) => ({
        id: def.id,
        label: def.label,
        startTime: def.startTime,
        endTime: def.endTime,
        available: false,
        reason: "mois_ferme",
      })),
      slotDefinitions: TIME_SLOTS,
    });
  }

  const p2cState = getP2cMonthState(clientMonthRequests, excludeRequestId);
  const p2cCheck = validateP2cBooking({
    requestedDate,
    clientRequests: clientMonthRequests,
    excludeRequestId,
    isFullDay: false,
  });
  if (!p2cCheck.ok) {
    const reason = p2cState.hasFullDayBooking
      ? "p2c_journee"
      : p2cState.quotaExhausted
        ? "p2c_quota"
        : "p2c_semaine";
    return res.json({
      date: dateKey,
      allowedByProfile: false,
      p2cBlocked: true,
      p2c: p2cState,
      fullDayAvailable: false,
      fullDayBlocked: false,
      slots: TIME_SLOTS.map((def) => ({
        id: def.id,
        label: def.label,
        startTime: def.startTime,
        endTime: def.endTime,
        available: false,
        reason,
      })),
      slotDefinitions: TIME_SLOTS,
    });
  }

  if (isPastDate(requestedDate)) {
    return res.json({
      date: dateKey,
      allowedByProfile: false,
      pastDate: true,
      fullDayBlocked: false,
      slots: TIME_SLOTS.map((def) => ({
        id: def.id,
        label: def.label,
        startTime: def.startTime,
        endTime: def.endTime,
        available: false,
        reason: "passe",
      })),
      slotDefinitions: TIME_SLOTS,
    });
  }

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
    excludeRequestId,
  });
  res.json({ ...payload, allowedByProfile: true, p2c: p2cState, slotDefinitions: TIME_SLOTS });
});

router.get("/availability", authRequired, roleRequired("client"), async (req, res) => {
  const month = Number(req.query.month || dayjs().month() + 1);
  const year = Number(req.query.year || dayjs().year());
  const excludeRequestId = req.query.excludeRequestId ? String(req.query.excludeRequestId) : undefined;

  const { monthStart, monthEnd } = monthBounds(month, year);

  const [client, blockedDates, blockedSlots, requests, clientMonthRequests] = await Promise.all([
    Client.findById(req.user.clientId),
    BlockedDate.find(),
    BlockedSlot.find({ date: { $gte: monthStart, $lte: monthEnd } }),
    Request.find({
      requestedDate: { $gte: monthStart, $lte: monthEnd },
      status: { $in: SLOT_LOCKING_STATUSES },
    }).select("requestedDate timeSlotId requestedTime status client"),
    Request.find({
      client: req.user.clientId,
      requestedDate: { $gte: monthStart, $lte: monthEnd },
      status: { $in: P2C_COUNTING_STATUSES },
    }).select("_id requestedDate status isFullDay timeSlotId"),
  ]);

  if (!client) return res.status(404).json({ message: "Client introuvable" });

  const accessRows = await ClientMonthAccess.find({
    $or: [{ year }, { year: year - 1 }, { year: year + 1 }],
  });
  const clientMonthOpen = isClientMonthOpen(year, month, accessRows);

  const p2c = getP2cMonthState(clientMonthRequests, excludeRequestId);
  const dates = monthAvailabilityWithSlots({
    month,
    year,
    clientType: client.clientType,
    blockedDates,
    blockedSlots,
    requests,
    p2cState: p2c,
    excludeRequestId,
    clientMonthClosed: !clientMonthOpen,
  });
  res.json({ month, year, dates, p2c, clientMonthOpen, slotDefinitions: TIME_SLOTS });
});

module.exports = router;
