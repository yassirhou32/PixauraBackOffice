const mongoose = require("mongoose");
const { mongoUri } = require("./env");

/**
 * Réutilise la connexion Mongoose entre invocations serverless (Vercel).
 * @see https://mongoosejs.com/docs/lambda.html
 */
async function connectDB() {
  if (!mongoUri) throw new Error("MONGO_URI manquant.");

  if (mongoose.connection.readyState === 1) return;

  mongoose.set("bufferCommands", false);

  if (!global.__mongooseConn) {
    global.__mongooseConn = { promise: null, logged: false };
  }
  const g = global.__mongooseConn;

  if (!g.promise) {
    g.promise = mongoose
      .connect(mongoUri, {
        /**
         * Reste sous la limite Vercel Hobby (~10 s) pour que l'API renvoie 503 au lieu de couper en silence.
         * @see https://mongoosejs.com/docs/lambda.html
         */
        serverSelectionTimeoutMS: 8_000,
        connectTimeoutMS: 8_000,
        socketTimeoutMS: 45_000,
        maxPoolSize: 10,
        /** Souvent utile si la résolution IPv6 pose problème vers Atlas. */
        family: 4,
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
