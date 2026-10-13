import mongoose from "mongoose";
import { assertSafeMongoUri } from "./dbGuard.js";

// MONGODB_URI is the connection string (MongoDB Atlas). MONGO_URI is the
// older name, still accepted so an existing local .env keeps working.
// Every URI handed out passes the production-database guard (dbGuard.js)
// first, so the server and the scripts all refuse an unsafe target.
export const getMongoUri = () => {
  const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
  return uri ? assertSafeMongoUri(uri) : uri;
};

export const connectDB = async () => {
  let uri;
  try {
    uri = getMongoUri();
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
  if (!uri) {
    console.error("MongoDB connection error: MONGODB_URI is not set in server/.env");
    process.exit(1);
  }

  try {
    const conn = await mongoose.connect(uri);
    console.log(`MongoDB connected: ${conn.connection.host} (database "${conn.connection.name}")`);
  } catch (error) {
    console.error(`MongoDB connection error: ${error.message}`);
    process.exit(1);
  }

  // Imported lazily so scripts that only need getMongoUri don't load models.
  const { runPaymentMigrations } = await import("../services/paymentLedger.js");
  await runPaymentMigrations();
};
