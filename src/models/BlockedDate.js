const mongoose = require("mongoose");

const blockedDateSchema = new mongoose.Schema(
  {
    date: { type: Date, required: true, unique: true },
    reason: { type: String, default: "indisponible" },
    lockedByAdmin: { type: Boolean, default: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model("BlockedDate", blockedDateSchema);
