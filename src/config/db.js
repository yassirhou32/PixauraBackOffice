const mongoose = require("mongoose");
const { mongoUri } = require("./env");

/**
 * Réutilise la connexion Mongoose entre invocations serverless (Vercel).
 * @see https://mongoosejs.com/docs/lambda.html
 */
async function connectDB() {
  if (!mongoUri) throw new Error("MONGO_URI manquant.");

  if (mongoose.connection.readyState === 1) return;

  if (!global.__mongooseConn) {
    global.__mongooseConn = { promise: null, logged: false };
  }
  const g = global.__mongooseConn;

  if (!g.promise) {
    g.promise = mongoose
      .connect(mongoUri, {
        /** Évite de bloquer Vercel jusqu'au timeout de la fonction (preflight + API). */
        serverSelectionTimeoutMS: 12_000,
        connectTimeoutMS: 12_000,
        socketTimeoutMS: 45_000,
      })
      .then(() => mongoose.connection)
      .catch((err) => {
        g.promise = null;
        throw err;
      });
  }
  await g.promise;
  if (!g.logged) {
    g.logged = true;
    console.log("MongoDB connecte");
  }
}

module.exports = connectDB;
