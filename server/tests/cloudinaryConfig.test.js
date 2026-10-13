// The startup check for this installation's Cloudinary configuration.
// Environment variables only — nothing connects to Cloudinary.
//   npm test
import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { assertCloudinaryConfig, getCloudinaryFolder } from "../src/config/cloudinary.js";

const KEYS = ["CLOUDINARY_CLOUD_NAME", "CLOUDINARY_API_KEY", "CLOUDINARY_API_SECRET", "CLOUDINARY_FOLDER"];
let saved;

beforeEach(() => {
  saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
  KEYS.forEach((k) => delete process.env[k]);
});

afterEach(() => {
  KEYS.forEach((k) => (saved[k] === undefined ? delete process.env[k] : (process.env[k] = saved[k])));
});

const credentials = () =>
  Object.assign(process.env, { CLOUDINARY_CLOUD_NAME: "demo", CLOUDINARY_API_KEY: "123", CLOUDINARY_API_SECRET: "abc" });

test("no Cloudinary at all is fine (uploads stay on local disk)", () => {
  assert.doesNotThrow(assertCloudinaryConfig);
});

test("credentials need this restaurant's own upload folder — there is no shared default", () => {
  credentials();
  assert.equal(getCloudinaryFolder(), "");
  assert.throws(assertCloudinaryConfig, /CLOUDINARY_FOLDER must be set/);
  process.env.CLOUDINARY_FOLDER = "  bookmyhall-platform/spice-garden ";
  assert.doesNotThrow(assertCloudinaryConfig);
  assert.equal(getCloudinaryFolder(), "bookmyhall-platform/spice-garden");
});

test("a half-finished configuration is refused rather than silently ignored", () => {
  process.env.CLOUDINARY_CLOUD_NAME = "demo";
  assert.throws(assertCloudinaryConfig, /partly configured: also set CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET/);
});
