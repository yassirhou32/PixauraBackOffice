const dayjs = require("dayjs");
const isoWeek = require("dayjs/plugin/isoWeek");
const { isRequestFullDay } = require("../constants/timeSlots");

dayjs.extend(isoWeek);

/** Maximum de demandes P2C par client et par mois civil. */
const P2C_MONTHLY_MAX = 2;

/** Comptées dans le quota mensuel (refusée = non). */
const P2C_COUNTING_STATUSES = ["en_attente", "validee", "a_completer"];

function isoWeekDescriptor(date) {
  const d = dayjs(date).startOf("day");
  return { isoWeekYear: d.isoWeekYear(), week: d.isoWeek() };
}

function descriptorsEqual(a, b) {
  return a.isoWeekYear === b.isoWeekYear && a.week === b.week;
}

function filterP2cRequests(clientRequests, excludeRequestId) {
  let active = (clientRequests || []).filter((r) => P2C_COUNTING_STATUSES.includes(r.status));
  if (excludeRequestId) {
    active = active.filter((r) => String(r._id) !== String(excludeRequestId));
  }
  return active;
}

function p2cQuotaWeight(requestDoc) {
  return isRequestFullDay(requestDoc) ? 2 : 1;
}

function getP2cMonthState(clientRequests, excludeRequestId) {
  const active = filterP2cRequests(clientRequests, excludeRequestId);
  const hasFullDayBooking = active.some((r) => isRequestFullDay(r));
  let usedWeight = active.reduce((sum, r) => sum + p2cQuotaWeight(r), 0);
  /** Sécurité : journée complète = toujours 2 projets consommés */
  if (hasFullDayBooking && usedWeight < P2C_MONTHLY_MAX) {
    usedWeight = P2C_MONTHLY_MAX;
  }
  const blockedIsoWeeks = [];
  for (const r of active) {
    if (isRequestFullDay(r)) continue;
    const desc = isoWeekDescriptor(r.requestedDate);
    if (!blockedIsoWeeks.some((b) => descriptorsEqual(b, desc))) {
      blockedIsoWeeks.push(desc);
    }
  }
  const quotaExhausted = usedWeight >= P2C_MONTHLY_MAX;
  return {
    maxPerMonth: P2C_MONTHLY_MAX,
    usedThisMonth: usedWeight,
    requestCount: active.length,
    remaining: Math.max(0, P2C_MONTHLY_MAX - usedWeight),
    blockedIsoWeeks,
    quotaExhausted,
    /** Plus aucune date du mois (journée complète = 2 projets d’un coup) */
    monthFullyBlocked: hasFullDayBooking || quotaExhausted,
    canBookFullDay: usedWeight === 0 && !hasFullDayBooking,
    hasFullDayBooking,
    editing: Boolean(excludeRequestId),
  };
}

/** Aucune nouvelle réservation possible ce mois (journée complète ou quota atteint). */
function isMonthFullyBlockedForP2c(p2cState) {
  if (!p2cState) return false;
  return Boolean(p2cState.monthFullyBlocked);
}

function isWeekBlockedByP2c(date, p2cState) {
  if (!p2cState?.blockedIsoWeeks?.length) return false;
  const d = isoWeekDescriptor(date);
  return p2cState.blockedIsoWeeks.some((b) => descriptorsEqual(b, d));
}

function validateP2cBooking({ requestedDate, clientRequests, excludeRequestId, isFullDay, p2cSlot }) {
  const state = getP2cMonthState(clientRequests, excludeRequestId);
  const weight = isFullDay ? 2 : 1;

  if (isFullDay && p2cSlot === 2) {
    return {
      ok: false,
      message: "La journee complete est reservee au formulaire Projet 1.",
      state,
    };
  }

  if (state.hasFullDayBooking && !isFullDay) {
    return {
      ok: false,
      message:
        "Vous avez reserve une journee complete ce mois : aucune autre date n'est disponible jusqu'au mois suivant.",
      state,
    };
  }

  if (state.usedThisMonth + weight > P2C_MONTHLY_MAX) {
    return {
      ok: false,
      message: isFullDay
        ? "Journee complete : vous devez avoir les 2 projets P2C du mois disponibles (aucune autre demande ce mois)."
        : "Vous avez deja utilise vos 2 projets P2C pour ce mois.",
      state,
    };
  }

  if (!isFullDay && isWeekBlockedByP2c(requestedDate, state)) {
    return {
      ok: false,
      message:
        "Cette semaine est deja utilisee pour votre premiere demande du mois. Choisissez une date dans une autre semaine.",
      state,
    };
  }

  return { ok: true, state };
}

function monthBounds(month, year) {
  const monthStart = dayjs(`${year}-${String(month).padStart(2, "0")}-01`).startOf("day").toDate();
  const monthEnd = dayjs(monthStart).endOf("month").toDate();
  return { monthStart, monthEnd };
}

module.exports = {
  P2C_MONTHLY_MAX,
  P2C_COUNTING_STATUSES,
  p2cQuotaWeight,
  isoWeekDescriptor,
  filterP2cRequests,
  getP2cMonthState,
  isMonthFullyBlockedForP2c,
  isWeekBlockedByP2c,
  validateP2cBooking,
  monthBounds,
};
