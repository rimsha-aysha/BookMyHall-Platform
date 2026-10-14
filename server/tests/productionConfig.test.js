// Production safety checks for one installation: required configuration,
// allowed website origins, debug routes, error details, login rate limits and
// security headers. In-memory MongoDB only — nothing external.
//   npm test
import { test, before, after, describe } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import request from "supertest";
import { MongoMemoryServer } from "mongodb-memory-server";

process.env.JWT_SECRET = "test-secret";
process.env.NODE_ENV = "production";
process.env.CLIENT_URL = "https://spicegarden.example, https://www.spicegarden.example/";

const { default: app } = await import("../src/app.js");
const { errorHandler } = await import("../src/middleware/errorHandler.js");
const { productionConfigProblems, parseClientOrigins } = await import("../src/config/env.js");

const GOOD = {
  NODE_ENV: "production",
  JWT_SECRET: "x".repeat(48),
  CLIENT_URL: "https://spicegarden.example",
  MONGODB_URI: "mongodb+srv://u:p@cluster.example/spice_garden",
  MONGODB_DB_NAME: "spice_garden",
  CLOUDINARY_CLOUD_NAME: "demo",
  CLOUDINARY_API_KEY: "123",
  CLOUDINARY_API_SECRET: "abc",
  CLOUDINARY_FOLDER: "bookmyhall-platform/spice-garden",
};

describe("required production configuration", () => {
  test("a complete configuration passes", () => {
    assert.deepEqual(productionConfigProblems(GOOD), []);
  });

  test("development and tests are not restricted", () => {
    assert.deepEqual(productionConfigProblems({ NODE_ENV: "development" }), []);
    assert.deepEqual(productionConfigProblems({}), []);
  });

  test("each missing or unsafe setting is reported, without its value", () => {
    const problems = (overrides) => productionConfigProblems({ ...GOOD, ...overrides }).join("\n");
    assert.match(problems({ JWT_SECRET: undefined }), /JWT_SECRET/);
    assert.match(problems({ JWT_SECRET: "short-secret" }), /at least 32 characters/);
    assert.match(problems({ CLIENT_URL: "" }), /CLIENT_URL must be set/);
    assert.match(problems({ CLIENT_URL: "http://spicegarden.example" }), /https:\/\//);
    assert.match(problems({ CLIENT_URL: "https://spicegarden.example/booking" }), /no path/);
    assert.match(problems({ MONGODB_URI: undefined }), /MONGODB_URI/);
    assert.match(problems({ MONGODB_DB_NAME: undefined }), /MONGODB_DB_NAME/);
    assert.match(problems({ CLOUDINARY_FOLDER: undefined }), /Cloudinary/);
    assert.match(problems({ CLOUDINARY_API_SECRET: "" }), /Cloudinary/);
    assert.doesNotMatch(problems({ JWT_SECRET: "short-secret" }), /short-secret/);
  });

  test("local uploads only with an explicit opt-in (persistent disk)", () => {
    const noCloudinary = { ...GOOD, CLOUDINARY_CLOUD_NAME: "", CLOUDINARY_API_KEY: "", CLOUDINARY_API_SECRET: "", CLOUDINARY_FOLDER: "" };
    assert.equal(productionConfigProblems(noCloudinary).length, 1);
    assert.deepEqual(productionConfigProblems({ ...noCloudinary, ALLOW_LOCAL_UPLOADS: "true" }), []);
  });

  test("on Render, NODE_ENV must be production", () => {
    assert.match(productionConfigProblems({ RENDER: "true", NODE_ENV: "development" }).join(), /NODE_ENV must be set to production/);
    assert.deepEqual(productionConfigProblems({ ...GOOD, RENDER: "true" }), []);
  });

  test("CLIENT_URL accepts several addresses and ignores trailing slashes", () => {
    assert.deepEqual(parseClientOrigins(" https://a.example/ ,https://www.a.example,, "), ["https://a.example", "https://www.a.example"]);
  });
});

describe("running app in production mode", () => {
  let mongo;
  before(async () => {
    mongo = await MongoMemoryServer.create();
    await mongoose.connect(mongo.getUri());
  });
  after(async () => {
    await mongoose.disconnect();
    await mongo?.stop();
  });

  test("only this installation's website origins are allowed", async () => {
    const allowed = await request(app).get("/api/settings/public").set("Origin", "https://www.spicegarden.example");
    assert.equal(allowed.headers["access-control-allow-origin"], "https://www.spicegarden.example");
    const other = await request(app).get("/api/settings/public").set("Origin", "https://fishandchips.example");
    assert.equal(other.headers["access-control-allow-origin"], undefined);
  });

  test("debug routes are not available", async () => {
    assert.equal((await request(app).get("/api/test/protected")).status, 404);
  });

  test("security headers are sent and the framework isn't advertised", async () => {
    const res = await request(app).get("/api/health");
    assert.equal(res.headers["x-content-type-options"], "nosniff");
    assert.equal(res.headers["x-frame-options"], "DENY");
    assert.equal(res.headers["x-powered-by"], undefined);
  });

  test("repeated login attempts from one address are limited", async () => {
    let last;
    for (let i = 0; i < 21; i += 1) {
      last = await request(app).post("/api/auth/login").send({ email: "nobody@x.test", password: "wrong" });
    }
    assert.equal(last.status, 429);
    assert.match(last.body.message, /Too many login attempts/);
    assert.ok(Number(last.headers["retry-after"]) > 0);
  });

  test("unexpected errors hide internal details; user-facing 4xx messages are kept", () => {
    const capture = (statusCode, error) => {
      const res = { statusCode, body: null, status(c) { this.statusCode = c; return this; }, json(b) { this.body = b; return this; } };
      const originalError = console.error;
      console.error = () => {};
      try {
        errorHandler(error, {}, res, () => {});
      } finally {
        console.error = originalError;
      }
      return res;
    };
    const internal = capture(500, new Error("secretOrPrivateKey must have a value"));
    assert.equal(internal.statusCode, 500);
    assert.equal(internal.body.message, "Something went wrong. Please try again.");
    assert.equal(internal.body.stack, undefined);
    const userFacing = capture(409, new Error("Hall is not available for the selected date and time"));
    assert.equal(userFacing.body.message, "Hall is not available for the selected date and time");
  });
});
