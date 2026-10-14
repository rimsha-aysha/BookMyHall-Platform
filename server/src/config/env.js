// Deployment configuration for one installation (one restaurant).
//
// Production (NODE_ENV=production) must be configured safely before the
// server starts — see productionConfigProblems(), checked by server.js.
// Locally (development/tests) nothing here is enforced.

export const isProduction = (env = process.env) => env.NODE_ENV === "production";

// CLIENT_URL: this installation's website address, or several separated by
// commas (e.g. "https://spicegarden.in,https://www.spicegarden.in").
// Trailing slashes are ignored, matching how browsers send the Origin.
export const parseClientOrigins = (value = process.env.CLIENT_URL) =>
  String(value || "")
    .split(",")
    .map((origin) => origin.trim().replace(/\/+$/, ""))
    .filter(Boolean);

const CLOUDINARY_KEYS = ["CLOUDINARY_CLOUD_NAME", "CLOUDINARY_API_KEY", "CLOUDINARY_API_SECRET", "CLOUDINARY_FOLDER"];
export const MIN_JWT_SECRET_LENGTH = 32;

// Everything that would make a production deployment unsafe or broken.
// Empty array = fine. Messages never include the values themselves.
export const productionConfigProblems = (env = process.env) => {
  const problems = [];

  // Render sets RENDER=true; without NODE_ENV=production none of the
  // production safeguards (including hiding error details) would apply.
  if (env.RENDER && !isProduction(env)) {
    problems.push("NODE_ENV must be set to production on Render");
  }
  if (!isProduction(env)) return problems;

  if (!env.JWT_SECRET || env.JWT_SECRET.length < MIN_JWT_SECRET_LENGTH) {
    problems.push(`JWT_SECRET must be a random string of at least ${MIN_JWT_SECRET_LENGTH} characters, unique to this installation`);
  }

  const origins = parseClientOrigins(env.CLIENT_URL);
  if (origins.length === 0) {
    problems.push("CLIENT_URL must be set to this installation's website address (comma-separate several)");
  } else if (!origins.every((origin) => /^https:\/\/[^/\s]+$/i.test(origin))) {
    problems.push("Each CLIENT_URL address must be an https:// origin with no path, e.g. https://www.example.com");
  }

  if (!env.MONGODB_URI && !env.MONGO_URI) problems.push("MONGODB_URI must be set to this installation's own database");
  if (!env.MONGODB_DB_NAME) problems.push("MONGODB_DB_NAME must be set (the database name in MONGODB_URI)");

  // Hosts such as Render reset the server's disk on every deploy, so photos
  // stored there would disappear. Cloudinary is required unless the server
  // explicitly has a persistent disk.
  const cloudinaryReady = CLOUDINARY_KEYS.every((key) => env[key]?.trim());
  if (!cloudinaryReady && env.ALLOW_LOCAL_UPLOADS !== "true") {
    problems.push(
      `Image uploads need Cloudinary in production: set ${CLOUDINARY_KEYS.join(", ")} ` +
        "(or ALLOW_LOCAL_UPLOADS=true only if the server has a persistent disk)"
    );
  }

  return problems;
};
