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
    /** Un des cinq créneaux fixes (ex. 08-10) ou journee-complete */
    timeSlotId: { type: String, default: "" },
    /** Journée entière : les 5 créneaux, compte double quota P2C du mois */
    isFullDay: { type: Boolean, default: false },
    /** 1 = premier P2C du mois, 2 = second (même logique quota / semaines) */
    p2cSlot: { type: Number, enum: [1, 2], default: null },
    requestedTime: { type: String, required: true },
    shootingAddress: { type: String, required: true },
    technicalConstraints: { type: String, required: true },
    onsiteContact: { type: String, required: true },
    freeComment: { type: String, default: "" },
    status: { type: String, enum: ["en_attente", "validee", "refusee", "a_completer"], default: "en_attente" },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Request", requestSchema);
