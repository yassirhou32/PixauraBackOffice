const dayjs = require("dayjs");
const BlockedDate = require("../models/BlockedDate");
const BlockedSlot = require("../models/BlockedSlot");
const Request = require("../models/Request");
const { normalizeDateOnly, isClientDateAllowed, isPastDate } = require("./calendarRules");
const {
  isValidSlotId,
  startTimeForSlot,
  occupiedSlotsForDate,
  isFullDayAvailable,
  dateKeyFromInput,
  SLOT_LOCKING_STATUSES,
} = require("./slotBooking");
const {
  FULL_DAY_SLOT_ID,
  isFullDaySlotId,
  isRequestFullDay,
} = require("../constants/timeSlots");
const { P2C_COUNTING_STATUSES, validateP2cBooking, monthBounds } = require("./p2cQuota");
const { mergeP2cWorkflowRequests, validateP2cSlotRules } = require("./p2cProjects");
const ClientMonthAccess = require("../models/ClientMonthAccess");
const { isClientMonthOpen } = require("./clientMonthAccess");

const CLIENT_EDITABLE_STATUSES = ["en_attente", "a_completer"];

const REQUIRED_STRING_FIELDS = [
  ["company", "Entreprise"],
  ["mainContact", "Contact principal"],
  ["email", "Email"],
  ["phone", "Telephone"],
  ["projectDetails", "Projet / demande"],
  ["shootingAddress", "Adresse de tournage"],
  ["technicalConstraints", "Contraintes techniques"],
  ["onsiteContact", "Contact sur place"],
];

function validateRequiredFields(body) {
  for (const [key, label] of REQUIRED_STRING_FIELDS) {
    const val = body[key];
    if (val === undefined || val === null || String(val).trim() === "") {
      return { ok: false, status: 400, message: `Le champ « ${label} » est obligatoire.` };
    }
  }
  if (!body.requestedDate || String(body.requestedDate).trim() === "") {
    return { ok: false, status: 400, message: "Choisissez une date dans le calendrier." };
  }
  if (!body.timeSlotId || String(body.timeSlotId).trim() === "") {
    return { ok: false, status: 400, message: "Choisissez un creneau ou la journee complete." };
  }
  return { ok: true };
}

const P2C_REQUEST_SELECT =
  "_id requestedDate status isFullDay timeSlotId p2cSlot createdAt company mainContact email phone communicationAxis projectDetails shootingAddress technicalConstraints onsiteContact freeComment";

async function loadClientMonthRequests(clientId, requestedDate) {
  const reqMonth = dayjs(requestedDate).month() + 1;
  const reqYear = dayjs(requestedDate).year();
  const { monthStart, monthEnd } = monthBounds(reqMonth, reqYear);
  return Request.find({
    client: clientId,
    requestedDate: { $gte: monthStart, $lte: monthEnd },
    status: { $in: P2C_COUNTING_STATUSES },
  }).select(P2C_REQUEST_SELECT);
}

/** Demandes du mois cible + Projet 1/2 du cycle (même si dates de tournage sur un autre mois). */
async function loadClientP2cWorkflowRequests(clientId, requestedDate) {
  const monthRequests = await loadClientMonthRequests(clientId, requestedDate);
  const allActive = await Request.find({
    client: clientId,
    status: { $in: P2C_COUNTING_STATUSES },
  })
    .sort({ createdAt: 1 })
    .select(P2C_REQUEST_SELECT);
  return mergeP2cWorkflowRequests(monthRequests, allActive);
}

/**
 * Valide date + créneau pour création ou modification client.
 * @param {{ client: object, body: object, excludeRequestId?: string }} opts
 */
async function validateClientRequestBooking({ client, body, excludeRequestId }) {
  const required = validateRequiredFields(body);
  if (!required.ok) return required;

  const p2cSlot = Number(body.p2cSlot);
  if (p2cSlot !== 1 && p2cSlot !== 2) {
    return { ok: false, status: 400, message: "Indiquez le projet P2C (1 ou 2)." };
  }

  const { timeSlotId } = body;
  const isFullDay = isFullDaySlotId(timeSlotId) || Boolean(body.isFullDay);

  if (!isValidSlotId(timeSlotId)) {
    return { ok: false, status: 400, message: "Choisissez un creneau ou la journee complete." };
  }

  const blockedDates = await BlockedDate.find();
  const requestedDate = normalizeDateOnly(body.requestedDate);
  const dateKey = dateKeyFromInput(requestedDate);

  if (isPastDate(requestedDate)) {
    return { ok: false, status: 400, message: "Impossible de reserver une date passee." };
  }

  const allowed = isClientDateAllowed({ date: requestedDate, clientType: client.clientType, blockedDates });
  if (!allowed) {
    return { ok: false, status: 400, message: "Cette date est indisponible pour votre profil." };
  }

  const reqMonth = dayjs(requestedDate).month() + 1;
  const reqYear = dayjs(requestedDate).year();
  const accessRows = await ClientMonthAccess.find({
    $or: [{ year: reqYear }, { year: reqYear - 1 }, { year: reqYear + 1 }],
  });
  if (!isClientMonthOpen(reqYear, reqMonth, accessRows)) {
    return {
      ok: false,
      status: 400,
      message: `Le mois de ${reqMonth}/${reqYear} n'est pas encore ouvert a la reservation par Pixaura.`,
    };
  }

  const clientMonthRequests = await loadClientMonthRequests(client._id, requestedDate);
  const workflowRequests = await loadClientP2cWorkflowRequests(client._id, requestedDate);

  const slotCheck = validateP2cSlotRules({
    p2cSlot,
    clientMonthRequests: workflowRequests,
    excludeRequestId,
    isFullDay,
  });
  if (!slotCheck.ok) {
    return { ok: false, status: 400, message: slotCheck.message };
  }

  const p2cCheck = validateP2cBooking({
    requestedDate,
    clientRequests: clientMonthRequests,
    excludeRequestId,
    isFullDay,
    p2cSlot,
  });
  if (!p2cCheck.ok) {
    return { ok: false, status: 400, message: p2cCheck.message };
  }

  const slotQuery = {
    requestedDate,
    status: { $in: SLOT_LOCKING_STATUSES },
  };
  if (excludeRequestId) slotQuery._id = { $ne: excludeRequestId };

  const sameDayValidated = await Request.find(slotQuery).select(
    "requestedDate timeSlotId requestedTime status _id isFullDay"
  );

  if (isFullDay) {
    const blockedSlots = await BlockedSlot.find({ date: requestedDate });
    const dayFree = isFullDayAvailable({
      dateKey,
      blockedDateDocs: blockedDates,
      blockedSlotDocs: blockedSlots,
      requests: sameDayValidated,
      excludeRequestId,
    });
    if (!dayFree) {
      return {
        ok: false,
        status: 400,
        message:
          "Journee complete indisponible : un ou plusieurs creneaux sont deja reserves ou bloques sur cette date.",
      };
    }
    return {
      ok: true,
      requestedDate,
      dateKey,
      requestedTime: "08:00",
      timeSlotId: FULL_DAY_SLOT_ID,
      isFullDay: true,
      p2cSlot,
    };
  }

  const blockedSlot = await BlockedSlot.findOne({ date: requestedDate, slotId: timeSlotId });
  if (blockedSlot) {
    return { ok: false, status: 400, message: "Ce creneau est bloque par l'administrateur." };
  }

  if (occupiedSlotsForDate(sameDayValidated, dateKey, excludeRequestId).has(timeSlotId)) {
    return { ok: false, status: 400, message: "Ce creneau est deja reserve." };
  }

  const fullDayTaken = sameDayValidated.some((r) => isRequestFullDay(r));
  if (fullDayTaken) {
    return { ok: false, status: 400, message: "Cette journee est reservee en totalite par une autre demande." };
  }

  return {
    ok: true,
    requestedDate,
    dateKey,
    requestedTime: startTimeForSlot(timeSlotId),
    timeSlotId,
    isFullDay: false,
    p2cSlot,
  };
}

module.exports = {
  CLIENT_EDITABLE_STATUSES,
  loadClientMonthRequests,
  loadClientP2cWorkflowRequests,
  validateClientRequestBooking,
  validateRequiredFields,
};
