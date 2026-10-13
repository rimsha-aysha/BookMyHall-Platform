// Configures a new installation for its restaurant from a JSON file:
// restaurant settings, the Owner account and an optional starting catalog.
// See INSTALL.md and setup/restaurant.example.json. Run from the server/
// folder, with server/.env pointing at THIS restaurant's own database:
//
//   npm run setup:restaurant -- --config setup/my-restaurant.json --dry-run
//   npm run setup:restaurant -- --config setup/my-restaurant.json
//
// Options:
//   --config <file>  the restaurant's setup file (required)
//   --dry-run        validate and show what would happen; write nothing
//   --force          allow re-running on an installation that is already set
//                    up or has bookings (existing Owner password is kept)
//
// The Owner's password is never read from the file. It is asked for (hidden)
// when a new Owner account is created, or taken from the OWNER_PASSWORD
// environment variable for non-interactive use. Connection strings and
// passwords are never printed.
import dotenv from "dotenv";
dotenv.config();

import fs from "fs";
import mongoose from "mongoose";
import { getMongoUri } from "../src/config/db.js";
import { runSetup, SetupError, MIN_OWNER_PASSWORD_LENGTH } from "../src/services/restaurantSetup.js";

const parseArgs = (argv) => {
  const args = { force: false, dryRun: false, config: "" };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--force") args.force = true;
    else if (arg === "--dry-run") args.dryRun = true;
    else if (arg === "--config") args.config = argv[(i += 1)] || "";
    else throw new SetupError(`Unknown option "${arg}"`);
  }
  if (!args.config) throw new SetupError("Usage: npm run setup:restaurant -- --config <file> [--dry-run] [--force]");
  return args;
};

// Reads a line from the terminal without echoing it.
const promptHidden = (question) =>
  new Promise((resolve, reject) => {
    const { stdin, stdout } = process;
    let value = "";
    stdout.write(question);
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding("utf8");
    const done = (fn) => {
      stdin.setRawMode(false);
      stdin.pause();
      stdin.removeListener("data", onData);
      stdout.write("\n");
      fn();
    };
    const onData = (chunk) => {
      for (const ch of chunk) {
        if (ch === "\r" || ch === "\n") return done(() => resolve(value));
        if (ch === "\u0003") return done(() => reject(new SetupError("Cancelled")));
        if (ch === "\u007f" || ch === "\b") value = value.slice(0, -1);
        else if (ch >= " ") value += ch;
      }
      return undefined;
    };
    stdin.on("data", onData);
  });

const askOwnerPassword = async () => {
  if (process.env.OWNER_PASSWORD) return process.env.OWNER_PASSWORD;
  if (!process.stdin.isTTY) {
    throw new SetupError("A new Owner account needs a password: run this in a terminal, or set OWNER_PASSWORD for this command.");
  }
  console.log(`\nChoose a password for the new Owner account (at least ${MIN_OWNER_PASSWORD_LENGTH} characters).`);
  const first = await promptHidden("Owner password: ");
  const second = await promptHidden("Repeat password: ");
  if (first !== second) throw new SetupError("The passwords did not match. Nothing was changed.");
  return first;
};

const readConfig = (file) => {
  let text;
  try {
    text = fs.readFileSync(file, "utf8");
  } catch {
    throw new SetupError(`Cannot read the setup file "${file}"`);
  }
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new SetupError(`"${file}" is not valid JSON: ${error.message}`);
  }
};

const run = async () => {
  const args = parseArgs(process.argv.slice(2));
  const config = readConfig(args.config);

  const uri = getMongoUri(); // passes the production-database safety guard
  if (!uri) throw new SetupError("MONGODB_URI is not set in server/.env");
  await mongoose.connect(uri);
  console.log(`Database: "${mongoose.connection.name}"${args.dryRun ? " (dry run — nothing will be written)" : ""}`);

  const result = await runSetup({ config, force: args.force, dryRun: args.dryRun, getOwnerPassword: askOwnerPassword });

  console.log(`\n${result.dryRun ? "Would" : "Done"}:`);
  result.actions.forEach((action) => console.log(`  - ${action}`));
  if (result.dryRun) console.log("\nRe-run without --dry-run to apply.");
  else console.log("\nSetup complete. The Owner can now log in and manage everything from the admin panel.");
};

run()
  .then(async () => {
    await mongoose.disconnect();
    process.exit(0);
  })
  .catch(async (error) => {
    console.error(error instanceof SetupError ? `\n${error.message}` : `\nSetup failed: ${error.message}`);
    await mongoose.disconnect();
    process.exit(1);
  });
