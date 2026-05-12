const mongoose = require("mongoose");

const requestSchema = new mongoose.Schema(
  {
    client: { type: mongoose.Schema.Types.ObjectId, ref: "Client", required: true },
    company: { type: String, required: true },
    mainContact: { type: String, required: true },
    email: { type: String, required: true },
    phone: { type: String, required: true },
    communicationAxis: { type: String, enum: ["commercial", "humain", "expertise", "autre"], required: true },
    projectDetails: { type: String, required: true },
    requestedDate: { type: Date, required: true },
    /** Un des cinq créneaux fixes (ex. 08-10) — requis pour les nouvelles demandes */
    timeSlotId: { type: String, default: "" },
    requestedTime: { type: String, required: true },
    shootingAddress: { type: String, required: true },
    technicalConstraints: { type: String, default: "" },
    onsiteContact: { type: String, default: "" },
    freeComment: { type: String, default: "" },
    status: { type: String, enum: ["en_attente", "validee", "refusee", "a_completer"], default: "en_attente" },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Request", requestSchema);
