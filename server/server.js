import dotenv from "dotenv";
dotenv.config();

import app from "./src/app.js";
import { connectDB } from "./src/config/db.js";
import { assertCloudinaryConfig } from "./src/config/cloudinary.js";
import { productionConfigProblems } from "./src/config/env.js";

const PORT = process.env.PORT || 5000;

const startServer = async () => {
  // Refuse to start an unsafe production deployment, listing every problem.
  const problems = productionConfigProblems();
  if (problems.length) {
    console.error(`Refusing to start — fix the server environment settings:\n  - ${problems.join("\n  - ")}`);
    process.exit(1);
  }
  try {
    assertCloudinaryConfig();
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
  await connectDB();
  app.listen(PORT, () => {
    console.log(`BookMyHall Platform server running on port ${PORT}`);
  });
};

startServer();
