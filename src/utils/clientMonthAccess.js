const dayjs = require("dayjs");

function monthKey(year, month) {
  return `${year}-${month}`;
}

/** Sans enregistrement : mois courant ouvert, futurs fermés, passés fermés. */
function defaultOpenForClients(year, month) {
  const now = dayjs();
  const cy = now.year();
  const cm = now.month() + 1;
  if (year < cy || (year === cy && month < cm)) return false;
  if (year === cy && month === cm) return true;
  return false;
}

function buildAccessMap(rows) {
  const map = new Map();
  for (const row of rows || []) {
    map.set(monthKey(row.year, row.month), Boolean(row.openForClients));
  }
  return map;
}

function isClientMonthOpen(year, month, accessRows) {
  const map = buildAccessMap(accessRows);
  const key = monthKey(year, month);
  if (map.has(key)) return map.get(key);
  return defaultOpenForClients(year, month);
}

/** Liste des 12 mois à partir du mois courant (affichage admin). */
function rollingMonthsFromNow(count = 12) {
  const start = dayjs().startOf("month");
  const list = [];
  for (let i = 0; i < count; i += 1) {
    const d = start.add(i, "month");
    list.push({ year: d.year(), month: d.month() + 1 });
  }
  return list;
}

const MONTH_NAMES_FR = [
  "Janvier",
  "Février",
  "Mars",
  "Avril",
  "Mai",
  "Juin",
  "Juillet",
  "Août",
  "Septembre",
  "Octobre",
  "Novembre",
  "Décembre",
];

function monthLabelFr(month, year) {
  const name = MONTH_NAMES_FR[month - 1] || `Mois ${month}`;
  return `${name} ${year}`;
}

module.exports = {
  monthKey,
  defaultOpenForClients,
  buildAccessMap,
  isClientMonthOpen,
  rollingMonthsFromNow,
  monthLabelFr,
};
