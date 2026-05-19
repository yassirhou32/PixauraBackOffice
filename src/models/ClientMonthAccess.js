const mongoose = require("mongoose");

/** Ouverture du calendrier client par mois civil (tous les clients). */
const clientMonthAccessSchema = new mongoose.Schema(
  {
    year: { type: Number, required: true },
    month: { type: Number, required: true, min: 1, max: 12 },
    openForClients: { type: Boolean, default: false },
  },
  { timestamps: true }
);

clientMonthAccessSchema.index({ year: 1, month: 1 }, { unique: true });

module.exports = mongoose.model("ClientMonthAccess", clientMonthAccessSchema);
