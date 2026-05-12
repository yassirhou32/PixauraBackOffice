/**
 * Point d'entrée Vercel (serverless) : toutes les requêtes sont routées vers Express.
 * Déployez avec la racine du projet = dossier `backend` sur Vercel.
 */
const serverless = require("serverless-http");
const connectDB = require("./src/config/db");
const { seedAdmin } = require("./src/seedAdmin");

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
  const handle = await getHandler();
  return handle(req, res);
};
