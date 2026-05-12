const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: ["admin", "client"], required: true },
    client: { type: mongoose.Schema.Types.ObjectId, ref: "Client", default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model("User", userSchema);
