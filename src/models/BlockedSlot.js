const mongoose = require("mongoose");

const blockedSlotSchema = new mongoose.Schema(
  {
    date: { type: Date, required: true },
    slotId: { type: String, required: true },
    reason: { type: String, default: "indisponible" },
    lockedByAdmin: { type: Boolean, default: true },
  },
  { timestamps: true }
);

blockedSlotSchema.index({ date: 1, slotId: 1 }, { unique: true });

module.exports = mongoose.model("BlockedSlot", blockedSlotSchema);
