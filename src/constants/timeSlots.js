/** Cinq créneaux fixes de 2 h (P2C Pixaura) */
const TIME_SLOTS = [
  { id: "08-10", startTime: "08:00", endTime: "10:00", label: "08h00 - 10h00" },
  { id: "10-12", startTime: "10:00", endTime: "12:00", label: "10h00 - 12h00" },
  { id: "14-16", startTime: "14:00", endTime: "16:00", label: "14h00 - 16h00" },
  { id: "16-18", startTime: "16:00", endTime: "18:00", label: "16h00 - 18h00" },
  { id: "18-20", startTime: "18:00", endTime: "20:00", label: "18h00 - 20h00" },
];

const SLOT_IDS = TIME_SLOTS.map((s) => s.id);

/** Réservation journée complète (5 créneaux) — compte pour 2 projets P2C du mois */
const FULL_DAY_SLOT_ID = "journee-complete";

function isFullDaySlotId(id) {
  return id === FULL_DAY_SLOT_ID;
}

function isValidSlotId(id) {
  return SLOT_IDS.includes(id) || isFullDaySlotId(id);
}

function isRequestFullDay(doc) {
  if (!doc) return false;
  return Boolean(doc.isFullDay) || isFullDaySlotId(doc.timeSlotId);
}

/** Anciennes demandes sans timeSlotId : déduire le créneau depuis l'heure de début */
function slotIdFromLegacyTime(requestedTime) {
  if (!requestedTime || typeof requestedTime !== "string") return null;
  const h = Number.parseInt(String(requestedTime).slice(0, 2), 10);
  if (Number.isNaN(h)) return null;
  if (h >= 8 && h < 10) return "08-10";
  if (h >= 10 && h < 12) return "10-12";
  if (h >= 14 && h < 16) return "14-16";
  if (h >= 16 && h < 18) return "16-18";
  if (h >= 18 && h < 20) return "18-20";
  return null;
}

function startTimeForSlot(slotId) {
  const s = TIME_SLOTS.find((x) => x.id === slotId);
  return s ? s.startTime : "08:00";
}

function fullDayLabel() {
  return "Journée complète (5 créneaux)";
}

module.exports = {
  TIME_SLOTS,
  SLOT_IDS,
  FULL_DAY_SLOT_ID,
  isFullDaySlotId,
  isRequestFullDay,
  isValidSlotId,
  slotIdFromLegacyTime,
  startTimeForSlot,
  fullDayLabel,
};
