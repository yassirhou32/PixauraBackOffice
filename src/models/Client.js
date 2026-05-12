const mongoose = require("mongoose");

const clientSchema = new mongoose.Schema(
  {
    companyName: { type: String, required: true },
    headOfficeAddress: { type: String, default: "" },
    siret: { type: String, default: "" },
    managerName: { type: String, default: "" },
    phone: { type: String, default: "" },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    clientType: { type: String, enum: ["paire", "impaire", "vip"], required: true },
    notes: { type: String, default: "" },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Client", clientSchema);
