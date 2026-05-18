const dayjs = require("dayjs");
const isoWeek = require("dayjs/plugin/isoWeek");

dayjs.extend(isoWeek);

function normalizeDateOnly(dateInput) {
  const d = dayjs(dateInput).startOf("day");
  return d.toDate();
}

function isWeekRuleAllowed({ date, clientType }) {
  const target = dayjs(date).startOf("day");
  const iso = target.isoWeek();
  const isEvenWeek = iso % 2 === 0;
  if (clientType === "vip") return true;
  if (clientType === "paire") return isEvenWeek;
  if (clientType === "impaire") return !isEvenWeek;
  return false;
}

/** Vrai si la date est strictement avant aujourd'hui (jour civil local serveur). */
function isPastDate(date) {
  const target = dayjs(date).startOf("day");
  const today = dayjs().startOf("day");
  return target.isBefore(today);
}

function isClientDateAllowed({ date, clientType, blockedDates }) {
  const target = dayjs(date).startOf("day");

  if (isPastDate(target)) return false;

  const isBlocked = blockedDates.some((blocked) => dayjs(blocked.date).startOf("day").isSame(target));
  if (isBlocked) return false;

  return isWeekRuleAllowed({ date, clientType });
}

function monthAvailability({ month, year, clientType, blockedDates }) {
  const first = dayjs(`${year}-${String(month).padStart(2, "0")}-01`);
  const days = first.daysInMonth();
  const result = [];

  for (let i = 1; i <= days; i += 1) {
    const current = dayjs(`${year}-${String(month).padStart(2, "0")}-${String(i).padStart(2, "0")}`);
    result.push({
      date: current.format("YYYY-MM-DD"),
      selectable: isClientDateAllowed({ date: current.toDate(), clientType, blockedDates }),
    });
  }

  return result;
}

module.exports = {
  normalizeDateOnly,
  isWeekRuleAllowed,
  isPastDate,
  isClientDateAllowed,
  monthAvailability,
};
