const connectDB = require("./config/db");
const app = require("./app");
const { seedAdmin } = require("./seedAdmin");
const { port } = require("./config/env");

async function start() {
  await connectDB();
  await seedAdmin();
  app.listen(port, () => console.log(`API lancee sur http://localhost:${port}`));
}

start().catch((err) => {
  console.error(err);
  process.exit(1);
});
