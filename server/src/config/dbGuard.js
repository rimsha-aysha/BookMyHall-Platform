// Production-database safety guard for BookMyHall Platform.
//
// This project was copied from the original single-restaurant BookMyHall,
// whose live database must never be touched from here. Every connection
// string is checked before anything connects to it (server startup and all
// scripts in server/scripts):
//   1. The URI must name a database explicitly.
//   2. That database must match MONGODB_DB_NAME — a variable the original
//      project's .env never had, so pasting the old .env here fails closed.
//   3. The database name must not be one of BLOCKED_DB_NAMES (the original
//      project's database).
//   4. No host may be listed in MONGODB_BLOCKED_HOSTS (optional,
//      comma-separated) — set it in your local .env to the original
//      cluster's host, so the host itself never has to be committed.
// Error messages never include the URI itself: it contains the password.

export const BLOCKED_DB_NAMES = Object.freeze(["bookmyhall"]);

const URI_PATTERN = /^mongodb(?:\+srv)?:\/\/(?:[^@/]*@)?([^/?]+)(?:\/([^?]*))?/i;

export const parseMongoUri = (uri) => {
  const match = URI_PATTERN.exec(uri || "");
  if (!match) return null;
  return {
    hosts: match[1].split(",").map((h) => h.replace(/:\d+$/, "").toLowerCase()),
    dbName: decodeURIComponent(match[2] || ""),
  };
};

export const assertSafeMongoUri = (uri, env = process.env) => {
  const parsed = parseMongoUri(uri);
  if (!parsed) {
    throw new Error("MongoDB safety guard: MONGODB_URI is not a valid mongodb:// or mongodb+srv:// connection string");
  }
  const { hosts, dbName } = parsed;

  if (!dbName) {
    throw new Error('MongoDB safety guard: MONGODB_URI must name its database (".../<database>?...")');
  }
  if (BLOCKED_DB_NAMES.includes(dbName.toLowerCase())) {
    throw new Error(
      `MongoDB safety guard: database "${dbName}" belongs to the original BookMyHall project and is blocked here`
    );
  }

  const expected = (env.MONGODB_DB_NAME || "").trim();
  if (!expected) {
    throw new Error("MongoDB safety guard: MONGODB_DB_NAME is not set in server/.env");
  }
  if (dbName !== expected) {
    throw new Error(
      `MongoDB safety guard: MONGODB_URI names database "${dbName}" but MONGODB_DB_NAME is "${expected}"`
    );
  }

  const blockedHosts = (env.MONGODB_BLOCKED_HOSTS || "")
    .split(",")
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);
  if (hosts.some((h) => blockedHosts.includes(h))) {
    throw new Error("MongoDB safety guard: MONGODB_URI points at a host listed in MONGODB_BLOCKED_HOSTS");
  }

  return uri;
};
