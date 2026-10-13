import dotenv from "dotenv";
dotenv.config();

import app from "./src/app.js";
import { connectDB } from "./src/config/db.js";
import { assertCloudinaryConfig } from "./src/config/cloudinary.js";

const PORT = process.env.PORT || 5000;

const startServer = async () => {
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
