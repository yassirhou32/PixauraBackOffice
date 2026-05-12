const nodemailer = require("nodemailer");
const { smtpHost, smtpPort, smtpUser, smtpPass } = require("../config/env");

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

module.exports = { sendCredentialsEmail };
