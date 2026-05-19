const nodemailer = require("nodemailer");
const { smtpHost, smtpPort, smtpUser, smtpPass } = require("../config/env");
const {
  TIME_SLOTS,
  isRequestFullDay,
  fullDayLabel,
  slotIdFromLegacyTime,
} = require("../constants/timeSlots");

function createTransporter() {
  if (!smtpHost || !smtpUser || !smtpPass) return null;
  return nodemailer.createTransport({
    host: smtpHost,
    port: smtpPort,
    secure: smtpPort === 465,
    requireTLS: smtpPort === 587,
    auth: { user: smtpUser, pass: smtpPass },
  });
}

function formatRequestDateFr(date) {
  const d = date instanceof Date ? date : new Date(date);
  return new Intl.DateTimeFormat("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(d);
}

function scheduleLabelForRequest({ timeSlotId, isFullDay, requestedTime }) {
  if (isRequestFullDay({ timeSlotId, isFullDay })) return fullDayLabel();
  const slot = TIME_SLOTS.find((s) => s.id === timeSlotId);
  if (slot) return slot.label;
  const legacyId = slotIdFromLegacyTime(requestedTime);
  if (legacyId) {
    const legacy = TIME_SLOTS.find((s) => s.id === legacyId);
    return legacy ? legacy.label : requestedTime;
  }
  return requestedTime || "Créneau à confirmer";
}

/** Email client lorsque l'admin valide une demande P2C. */
async function sendRequestValidatedEmail({
  to,
  company,
  requestedDate,
  timeSlotId,
  isFullDay,
  requestedTime,
  p2cSlot,
}) {
  const transporter = createTransporter();
  if (!transporter) return { sent: false, reason: "SMTP non configure" };
  if (!to || !String(to).trim()) return { sent: false, reason: "Adresse email manquante" };

  const dateLabel = formatRequestDateFr(requestedDate);
  const slotLabel = scheduleLabelForRequest({ timeSlotId, isFullDay, requestedTime });
  const companyLabel = company ? String(company).trim() : "votre société";
  const p2cLine =
    p2cSlot === 2
      ? "\n\nProjet P2C n°2 du mois."
      : p2cSlot === 1
        ? "\n\nProjet P2C n°1 du mois."
        : "";

  const text = `Bonjour,

Votre demande de tournage pour ${companyLabel} a été validée par l'équipe Pixaura.

Date : ${dateLabel}
Créneau : ${slotLabel}${p2cLine}

Vous pouvez consulter le détail dans votre espace membre Pixaura.

Cordialement,
L'équipe Pixaura`;

  try {
    await transporter.sendMail({
      from: { name: "Pixaura", address: smtpUser },
      to: String(to).trim(),
      subject: "Pixaura — Votre demande de tournage est confirmée",
      text,
    });
    return { sent: true };
  } catch (err) {
    return { sent: false, reason: err.message || String(err) };
  }
}

async function sendCredentialsEmail({ to, password }) {
  const transporter = createTransporter();
  if (!transporter) return { sent: false, reason: "SMTP non configure" };

  try {
    await transporter.sendMail({
      from: { name: "Pixaura", address: smtpUser },
      to,
      subject: "Acces espace membre Pixaura",
      text: `Bonjour,\n\nVotre acces membre est cree.\nIdentifiant: ${to}\nMot de passe: ${password}\n\nCordialement,\nPixaura`,
    });
    return { sent: true };
  } catch (err) {
    return { sent: false, reason: err.message || String(err) };
  }
}

module.exports = { sendCredentialsEmail, sendRequestValidatedEmail };
