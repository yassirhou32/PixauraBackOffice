/**
 * Point d'entrée Vercel (serverless) : toutes les requêtes sont routées vers Express.
 * Déployez avec la racine du projet = dossier `backend` sur Vercel.
 *
 * OPTIONS (CORS preflight) répond sans attendre MongoDB — sinon le navigateur reste en "pending".
 */
const serverless = require("serverless-http");
const connectDB = require("./src/config/db");
const { seedAdmin } = require("./src/seedAdmin");

function applyCorsHeaders(req, res) {
  const { frontendUrl } = require("./src/config/env");
  const origins =
    typeof frontendUrl === "string" && frontendUrl.includes(",")
      ? frontendUrl.split(",").map((s) => s.trim()).filter(Boolean)
      : [String(frontendUrl || "").trim()].filter(Boolean);

  const requestOrigin = req.headers?.origin;
  let allow = false;
  if (origins.length === 0) {
    allow = "*";
  } else if (origins.length === 1) {
    allow = origins[0];
  } else if (requestOrigin && origins.includes(requestOrigin)) {
    allow = requestOrigin;
  } else if (requestOrigin) {
    allow = false;
  } else {
    allow = origins[0];
  }

  if (allow) {
    res.setHeader("Access-Control-Allow-Origin", allow);
    res.setHeader("Vary", "Origin");
  }
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Max-Age", "86400");
}

let handler;

async function getHandler() {
  if (!handler) {
    await connectDB();
    await seedAdmin();
    const app = require("./src/app");
    handler = serverless(app);
  }
  return handler;
}

module.exports = async (req, res) => {
  if (req.method === "OPTIONS") {
    applyCorsHeaders(req, res);
    res.status(204).end();
    return;
  }

  try {
    const handle = await getHandler();
    return handle(req, res);
  } catch (err) {
    console.error("[vercel]", err);
    applyCorsHeaders(req, res);
    if (!res.headersSent) {
      res.status(503).json({
        message: err.message || "Service indisponible",
        hint: "Verifiez MONGO_URI sur Vercel et la connexion Atlas.",
      });
    }
  }
};
