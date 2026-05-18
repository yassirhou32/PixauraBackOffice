const dayjs = require("dayjs");
const { TIME_SLOTS, SLOT_IDS, slotIdFromLegacyTime, isValidSlotId, startTimeForSlot } = require("../constants/timeSlots");
const { isWeekRuleAllowed, isPastDate } = require("./calendarRules");

const ACTIVE_STATUSES = ["en_attente", "validee", "a_completer"];

/** Un créneau n'est grisé pour les *autres* clients qu'après validation admin (statut validee). */
const SLOT_LOCKING_STATUSES = ["validee"];

function dateKeyFromInput(date) {
  return dayjs(date).format("YYYY-MM-DD");
}

function effectiveSlotId(requestDoc) {
  if (requestDoc.timeSlotId && isValidSlotId(requestDoc.timeSlotId)) return requestDoc.timeSlotId;
  return slotIdFromLegacyTime(requestDoc.requestedTime);
}

/** Créneaux pris au sens « réservé pour les autres » : uniquement demandes validées par l'admin. */
function occupiedSlotsForDate(requests, dateKey) {
  const set = new Set();
  for (const req of requests) {
    if (!SLOT_LOCKING_STATUSES.includes(req.status)) continue;
    const key = dateKeyFromInput(req.requestedDate);
    if (key !== dateKey) continue;
    const sid = effectiveSlotId(req);
    if (sid) set.add(sid);
  }
  return set;
}

/** slotId -> true si bloqué par admin pour ce jour */
function adminBlockedSlotsForDate(blockedSlotDocs, dateKey) {
  const set = new Set();
  for (const b of blockedSlotDocs) {
    const key = dateKeyFromInput(b.date);
    if (key === dateKey) set.add(b.slotId);
  }
  return set;
}

function isFullDayBlocked(blockedDateDocs, dateKey) {
  return blockedDateDocs.some((b) => dateKeyFromInput(b.date) === dateKey);
}

function hasAnyFreeSlot({ dateKey, blockedDateDocs, blockedSlotDocs, requests }) {
  if (isFullDayBlocked(blockedDateDocs, dateKey)) return false;
  const occupied = occupiedSlotsForDate(requests, dateKey);
  const adminBlocked = adminBlockedSlotsForDate(blockedSlotDocs, dateKey);
  return SLOT_IDS.some((sid) => !occupied.has(sid) && !adminBlocked.has(sid));
}

function buildDaySlotsForClient({ dateKey, blockedDateDocs, blockedSlotDocs, requests }) {
  const fullDay = isFullDayBlocked(blockedDateDocs, dateKey);
  const occupied = occupiedSlotsForDate(requests, dateKey);
  const adminBlocked = adminBlockedSlotsForDate(blockedSlotDocs, dateKey);

  const slots = TIME_SLOTS.map((def) => {
    let available = true;
    let reason = "";
    if (fullDay) {
      available = false;
      reason = "jour_bloque";
    } else if (adminBlocked.has(def.id)) {
      available = false;
      reason = "admin";
    } else if (occupied.has(def.id)) {
      available = false;
      reason = "reserve";
    }
    return {
      id: def.id,
      label: def.label,
      startTime: def.startTime,
      endTime: def.endTime,
      available,
      reason: available ? "" : reason,
    };
  });

  return { date: dateKey, fullDayBlocked: fullDay, slots };
}

/** Détail admin : qui occupe chaque créneau */
function buildDaySlotsForAdmin({ dateKey, blockedDateDocs, blockedSlotDocs, requests }) {
  const fullDay = isFullDayBlocked(blockedDateDocs, dateKey);
  const adminBlockIdBySlot = new Map();
  for (const b of blockedSlotDocs) {
    if (dateKeyFromInput(b.date) === dateKey) adminBlockIdBySlot.set(b.slotId, String(b._id));
  }

  const bySlot = new Map();
  for (const req of requests) {
    if (!ACTIVE_STATUSES.includes(req.status)) continue;
    if (dateKeyFromInput(req.requestedDate) !== dateKey) continue;
    const sid = effectiveSlotId(req);
    if (!sid) continue;
    if (!bySlot.has(sid)) bySlot.set(sid, []);
    bySlot.get(sid).push({
      requestId: String(req._id),
      clientId: String(req.client),
      company: req.company || "",
    });
  }

  const slots = TIME_SLOTS.map((def) => {
    const adminId = adminBlockIdBySlot.get(def.id) || null;
    const admin = Boolean(adminId);
    const bookings = bySlot.get(def.id) || [];
    return {
      id: def.id,
      label: def.label,
      startTime: def.startTime,
      endTime: def.endTime,
      adminBlocked: admin,
      blockedSlotId: adminId,
      bookings,
      free: !fullDay && !admin && bookings.length === 0,
    };
  });

  return { date: dateKey, fullDayBlocked: fullDay, slots };
}

function monthAvailabilityWithSlots({ month, year, clientType, blockedDates, blockedSlots, requests }) {
  const first = dayjs(`${year}-${String(month).padStart(2, "0")}-01`);
  const days = first.daysInMonth();
  const result = [];
  for (let i = 1; i <= days; i += 1) {
    const current = dayjs(`${year}-${String(month).padStart(2, "0")}-${String(i).padStart(2, "0")}`);
    const dateKey = current.format("YYYY-MM-DD");
    const dateObj = current.toDate();
    const past = isPastDate(dateObj);
    const inProfile = isWeekRuleAllowed({ date: dateObj, clientType });
    const fullDayBlocked = isFullDayBlocked(blockedDates, dateKey);
    const hasFreeSlot = hasAnyFreeSlot({
      dateKey,
      blockedDateDocs: blockedDates,
      blockedSlotDocs: blockedSlots,
      requests,
    });
    result.push({
      date: dateKey,
      /** Clic possible : pas de date passée + règle semaine paire / impaire / VIP */
      selectable: !past && inProfile,
      inProfile,
      isPast: past,
      fullDayBlocked,
      hasFreeSlot,
    });
  }
  return result;
}

module.exports = {
  TIME_SLOTS,
  SLOT_IDS,
  isValidSlotId,
  startTimeForSlot,
  slotIdFromLegacyTime,
  effectiveSlotId,
  dateKeyFromInput,
  occupiedSlotsForDate,
  adminBlockedSlotsForDate,
  hasAnyFreeSlot,
  buildDaySlotsForClient,
  buildDaySlotsForAdmin,
  monthAvailabilityWithSlots,
  ACTIVE_STATUSES,
  SLOT_LOCKING_STATUSES,
};
