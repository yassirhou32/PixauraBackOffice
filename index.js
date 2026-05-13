/**
 * Point d'entrée Vercel (serverless) : toutes les requêtes sont routées vers Express.
 * Déployez avec la racine du projet = dossier `backend` sur Vercel.
 *
 * IMPORTANT : sur @vercel/node, req/res sont des objets Node HTTP — l'app Express
 * peut être appelée directement (sans `serverless-http`, qui est pour AWS Lambda).
 *
 * OPTIONS (CORS preflight) et GET / répondent sans attendre MongoDB pour éviter
 * tout "loading infini" dans le navigateur.
 */
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

function requestPath(req) {
  const u = req.url || req.originalUrl || "";
  return (u.split("?")[0] || "/").replace(/\/+$/, "") || "/";
}

let appReady;

async function getApp() {
  if (!appReady) {
    appReady = (async () => {
      await connectDB();
      try {
        await seedAdmin();
      } catch (e) {
        console.warn("[seedAdmin] ignore:", e.message || e);
      }
      return require("./src/app");
    })().catch((err) => {
      appReady = null;
      throw err;
    });
  }
  return appReady;
}

module.exports = async (req, res) => {
  const p = requestPath(req);

  if (req.method === "OPTIONS") {
    applyCorsHeaders(req, res);
    res.statusCode = 204;
    res.end();
    return;
  }

  if (req.method === "GET" && (p === "/" || p === "")) {
    applyCorsHeaders(req, res);
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.statusCode = 200;
    res.end(
      JSON.stringify({
        ok: true,
        service: "pixaura-api",
        docs: "Routes sous /api — ex. POST /api/auth/login, GET /api/health",
      })
    );
    return;
  }

  if (req.method === "GET" && p === "/favicon.ico") {
    applyCorsHeaders(req, res);
    res.statusCode = 204;
    res.end();
    return;
  }

  try {
    const app = await getApp();
    return app(req, res);
  } catch (err) {
    console.error("[vercel]", err);
    applyCorsHeaders(req, res);
    if (!res.headersSent) {
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.statusCode = 503;
      res.end(
        JSON.stringify({
          message: err.message || "Service indisponible",
          hint: "Verifiez MONGO_URI sur Vercel et la connectivite Atlas.",
        })
      );
    }
  }
};
