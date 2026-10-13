// Tests for the one-time restaurant setup (services/restaurantSetup.js, used
// by scripts/setupRestaurant.js), run against an in-memory MongoDB.
//   npm test
import { test, before, after, beforeEach, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import mongoose from "mongoose";
import request from "supertest";
import { MongoMemoryServer } from "mongodb-memory-server";

process.env.JWT_SECRET = "test-secret";
process.env.NODE_ENV = "production"; // silences request logging

const { default: app } = await import("../src/app.js");
const { default: User } = await import("../src/models/User.js");
const { default: Settings } = await import("../src/models/Settings.js");
const { default: Hall } = await import("../src/models/Hall.js");
const { default: Food } = await import("../src/models/Food.js");
const { default: Booking } = await import("../src/models/Booking.js");
const { runSetup, SetupError } = await import("../src/services/restaurantSetup.js");

const EXAMPLE = JSON.parse(fs.readFileSync(new URL("../setup/restaurant.example.json", import.meta.url), "utf8"));
const PASSWORD = "correct-horse-battery";

const config = (overrides = {}) => ({
  restaurant: { businessName: "Spice Garden", brandColor: "#1f6f5c", openingTime: "10:00", closingTime: "23:00", ...overrides.restaurant },
  owner: { name: "Asha Owner", email: "Owner@SpiceGarden.test", ...overrides.owner },
  ...(overrides.catalog && { catalog: overrides.catalog }),
});

const setup = (cfg, opts = {}) => runSetup({ config: cfg, getOwnerPassword: async () => PASSWORD, ...opts });

const counts = async () => ({
  settings: await Settings.countDocuments(),
  users: await User.countDocuments(),
  halls: await Hall.countDocuments(),
  foods: await Food.countDocuments(),
});
const NOTHING = { settings: 0, users: 0, halls: 0, foods: 0 };

let mongo;
before(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  await Settings.init();
  await User.init();
});

after(async () => {
  await mongoose.disconnect();
  await mongo?.stop();
});

beforeEach(async () => {
  await Promise.all([Settings, User, Hall, Food, Booking].map((Model) => Model.deleteMany({})));
});

describe("a fresh installation", () => {
  test("the shipped example file is valid", async () => {
    const result = await setup(EXAMPLE, { dryRun: true });
    assert.equal(result.dryRun, true);
    assert.ok(result.actions.some((a) => a.includes("Create the Owner account owner@example.com")));
  });

  test("a dry run validates and reports, but writes nothing and never asks for a password", async () => {
    let asked = false;
    const result = await runSetup({ config: EXAMPLE, dryRun: true, getOwnerPassword: async () => (asked = true) });
    assert.equal(asked, false);
    assert.ok(result.actions.includes("Add 2 halls"));
    assert.deepEqual(await counts(), NOTHING);
  });

  test("sets up the restaurant, its Owner and the starting catalog", async () => {
    const result = await setup(EXAMPLE);
    assert.equal(result.dryRun, false);

    const settings = await Settings.findOne();
    assert.equal(settings.businessName, "Your Restaurant Name");
    assert.equal(settings.minNoticeDays, 2);
    assert.ok(settings.setupCompletedAt instanceof Date);

    const owner = await User.findOne({ role: "owner" }).select("+password");
    assert.equal(owner.email, "owner@example.com");
    assert.notEqual(owner.password, PASSWORD, "the password is stored hashed");
    assert.equal(await Hall.countDocuments(), 2);
    assert.equal(await Food.countDocuments(), 2);

    const login = await request(app).post("/api/auth/login").send({ email: "owner@example.com", password: PASSWORD });
    assert.equal(login.status, 200);
    assert.equal(login.body.user.role, "owner");

    const pub = (await request(app).get("/api/settings/public")).body.data;
    assert.equal(pub.businessName, "Your Restaurant Name");
    assert.equal("setupCompletedAt" in pub, false);
  });

  test("an Owner-only setup keeps the default BookMyHall branding for later configuration", async () => {
    const result = await setup({ owner: { name: "Asha Owner", email: "owner@bookmyhall.test" } });
    assert.ok(result.actions.some((a) => a.includes('Keep the restaurant branding as "BookMyHall"')));

    const settings = await Settings.findOne();
    assert.equal(settings.businessName, "BookMyHall");
    assert.ok(settings.setupCompletedAt instanceof Date);
    assert.ok(await User.findOne({ email: "owner@bookmyhall.test", role: "owner" }));
    assert.equal((await request(app).get("/api/settings/public")).body.data.businessName, "BookMyHall");

    // The Owner then renames it from Restaurant Settings, which the site picks up.
    const login = await request(app).post("/api/auth/login").send({ email: "owner@bookmyhall.test", password: PASSWORD });
    const renamed = await request(app)
      .put("/api/settings")
      .set({ Authorization: `Bearer ${login.body.token}` })
      .send({ businessName: "Spice Garden Banquets" });
    assert.equal(renamed.status, 200, JSON.stringify(renamed.body));
    assert.equal((await request(app).get("/api/settings/public")).body.data.businessName, "Spice Garden Banquets");
  });

  test("a partial restaurant section changes only the fields given", async () => {
    await setup(config({ restaurant: { businessName: undefined, brandColor: "#123456" } }));
    const settings = await Settings.findOne();
    assert.equal(settings.businessName, "BookMyHall");
    assert.equal(settings.brandColor, "#123456");
  });

  test("the Owner email is stored in lower case", async () => {
    await setup(config());
    assert.ok(await User.findOne({ email: "owner@spicegarden.test", role: "owner" }));
  });
});

describe("refuses unsafe or invalid input — and then writes nothing", () => {
  const rejects = async (cfg, pattern, opts) => {
    await assert.rejects(setup(cfg, opts), (error) => {
      assert.ok(error instanceof SetupError, error.stack);
      assert.match(error.message, pattern);
      return true;
    });
    assert.deepEqual(await counts(), NOTHING);
  };

  test("passwords, secrets, tokens or keys anywhere in the file", async () => {
    await rejects(config({ owner: { password: "hunter2hunter2" } }), /must not contain passwords[\s\S]*owner\.password/);
    await rejects({ ...config(), razorpay: { keySecret: "x" } }, /razorpay\.keySecret/);
    await rejects({ ...config(), catalog: { halls: [{ name: "H", capacity: 1, price: 1, apiKey: "x" }] } }, /apiKey/);
  });

  test("invalid restaurant settings, using the same rules as the API", async () => {
    await rejects(config({ restaurant: { brandColor: "teal" } }), /restaurant\.brandColor: Accent colour/);
    await rejects(config({ restaurant: { businessName: "" } }), /restaurant\.businessName/);
    await rejects(config({ restaurant: { mapUrl: "http://maps.example" } }), /restaurant\.mapUrl/);
    await rejects(config({ restaurant: { openingTime: "18:00", closingTime: "09:00" } }), /after opening time/);
    await rejects(config({ restaurant: { minNoticeDays: 30, maxAdvanceDays: 10 } }), /greater than the minimum notice/);
  });

  test("unknown fields (typos) are reported rather than silently ignored", async () => {
    await rejects(config({ restaurant: { buisnessName: "Typo" } }), /restaurant\.buisnessName: unknown field/);
    await rejects({ ...config(), extras: {} }, /config\.extras: unknown field/);
    await rejects(config({ catalog: { halls: [{ name: "H", capacity: 10, price: 1, colour: "red" }] } }), /catalog\.halls\[0\]\.colour/);
  });

  test("invalid owner or catalog entries", async () => {
    await rejects(config({ owner: { email: "not-an-email" } }), /owner\.email/);
    await rejects(config({ catalog: { halls: [{ name: "No capacity", price: 100 }] } }), /catalog\.halls\[0\]\.capacity/);
    await rejects(config({ catalog: { foods: [{ name: "Bad photo", price: 1, images: ["file:///C:/x.jpg"] }] } }), /catalog\.foods\[0\]\.images/);
    await rejects(config({ catalog: { foods: "not a list" } }), /catalog\.foods: must be an array/);
  });

  test("a short Owner password", async () => {
    await rejects(config(), /at least 10 characters/, { getOwnerPassword: async () => "short" });
  });

  test("an Owner email that belongs to another role", async () => {
    await User.create({ name: "M", email: "owner@spicegarden.test", password: "secret123", role: "manager" });
    await assert.rejects(setup(config()), /already belongs to a manager account/);
    assert.equal(await Settings.countDocuments(), 0);
  });
});

describe("an installation that is already in use", () => {
  test("a completed setup is never overwritten without --force", async () => {
    await setup(config());
    await assert.rejects(setup(config({ restaurant: { businessName: "Hijacked" } })), /already set up/);
    assert.equal((await Settings.findOne()).businessName, "Spice Garden");
  });

  test("a database with bookings is not configured without --force", async () => {
    await Booking.collection.insertOne({ eventType: "Wedding" });
    await assert.rejects(setup(config()), /already has 1 booking/);
    assert.equal(await Settings.countDocuments(), 0);
  });

  test("--force checks the merged settings before writing anything", async () => {
    await setup(config({ restaurant: { maxAdvanceDays: 10 } }));
    const owners = await User.countDocuments();
    // A 30-day notice is valid on its own, but not with the stored 10-day limit.
    const cfg = config({ owner: { email: "new-owner@spicegarden.test" } });
    cfg.restaurant = { businessName: "Spice Garden", minNoticeDays: 30 };
    await assert.rejects(setup(cfg, { force: true }), /would be invalid[\s\S]*greater than the minimum notice/);
    assert.equal(await User.countDocuments(), owners, "no Owner was created");
    assert.equal((await Settings.findOne()).minNoticeDays, 0);
  });

  test("--force updates the settings but keeps the Owner's password and existing catalog", async () => {
    await setup(config({ catalog: { halls: [{ name: "Original Hall", capacity: 50, price: 1000 }] } }));
    const before = await User.findOne({ role: "owner" }).select("+password");

    let asked = false;
    const result = await runSetup({
      config: config({ restaurant: { businessName: "Spice Garden & Co" }, catalog: { halls: [{ name: "New Hall", capacity: 9, price: 9 }] } }),
      force: true,
      getOwnerPassword: async () => {
        asked = true;
        return "another-long-password";
      },
    });

    assert.equal(asked, false, "no password needed for an existing Owner");
    assert.ok(result.actions.some((a) => a.includes("password unchanged")));
    assert.ok(result.actions.some((a) => a.startsWith("Skip halls")));
    assert.equal((await Settings.findOne()).businessName, "Spice Garden & Co");
    assert.equal(await Settings.countDocuments(), 1);
    assert.deepEqual((await Hall.find()).map((h) => h.name), ["Original Hall"]);
    const after = await User.findOne({ role: "owner" }).select("+password");
    assert.equal(after.password, before.password);
  });
});
