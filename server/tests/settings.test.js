// API tests for the restaurant settings (profile, branding, contact and
// booking rules), run against an in-memory MongoDB — nothing external.
//   npm test
import { test, before, after, beforeEach, describe } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import request from "supertest";
import { MongoMemoryServer } from "mongodb-memory-server";

process.env.JWT_SECRET = "test-secret";
process.env.NODE_ENV = "production"; // silences request logging

const { default: app } = await import("../src/app.js");
const { default: User } = await import("../src/models/User.js");
const { default: Settings } = await import("../src/models/Settings.js");
const { generateToken } = await import("../src/utils/generateToken.js");
const { DEFAULT_EVENT_TYPES } = await import("../src/config/bookingRules.js");

let mongo;
const tokens = {};
const auth = (who) => ({ Authorization: `Bearer ${tokens[who]}` });

const update = (body, who = "owner") => request(app).put("/api/settings").set(auth(who)).send(body);
const publicSettings = async () => (await request(app).get("/api/settings/public")).body.data;
const fieldErrors = (res) => (res.body.errors || []).map((e) => e.field);

before(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  await Settings.init(); // unique `key` index in place before any test runs

  for (const role of ["owner", "manager", "coordinator", "customer"]) {
    const user = await User.create({
      name: `${role} user`,
      email: `${role}@test.local`,
      password: "secret123",
      role,
      ...(role === "customer" && { phone: "9123456780" }),
    });
    tokens[role] = generateToken(user);
  }
});

after(async () => {
  await mongoose.disconnect();
  await mongo?.stop();
});

beforeEach(async () => {
  await Settings.deleteMany({});
});

describe("defaults", () => {
  test("a new installation starts with neutral details and the original booking behaviour", async () => {
    const s = await publicSettings();
    assert.equal(s.businessName, "Our Restaurant");
    assert.equal(s.tagline, "");
    assert.equal(s.logoUrl, "");
    assert.deepEqual(s.coverImages, []);
    assert.deepEqual(s.eventTypes, [...DEFAULT_EVENT_TYPES]);
    assert.equal(s.openingTime, "");
    assert.equal(s.closingTime, "");
    assert.equal(s.minNoticeDays, 0);
    assert.equal(s.maxAdvanceDays, null);
    assert.equal(s.advancePaymentPercentage, 50);
    assert.equal(s.timezone, "Asia/Kolkata");
  });

  test("the public endpoint exposes only the public fields", async () => {
    await Settings.create({ setupCompletedAt: new Date() });
    const s = await publicSettings();
    for (const hidden of ["_id", "key", "setupCompletedAt", "createdAt", "updatedAt", "__v"]) {
      assert.equal(hidden in s, false, `${hidden} must not be public`);
    }
  });

  test("simultaneous first requests create exactly one settings document", async () => {
    const results = await Promise.all(Array.from({ length: 8 }, () => request(app).get("/api/settings/public")));
    assert.ok(results.every((r) => r.status === 200));
    assert.equal(await Settings.countDocuments(), 1);
  });

  test("a settings document from before these fields existed keeps working", async () => {
    await Settings.collection.insertOne({
      businessName: "Legacy Hall",
      contactPhone: "0484 2345678",
      advancePaymentPercentage: 30,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const s = await publicSettings();
    assert.equal(s.businessName, "Legacy Hall");
    assert.equal(s.advancePaymentPercentage, 30);
    assert.deepEqual(s.eventTypes, [...DEFAULT_EVENT_TYPES]);
    assert.equal(s.maxAdvanceDays, null);

    const res = await update({ tagline: "Since 1990" });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.data.businessName, "Legacy Hall");
    assert.equal(await Settings.countDocuments(), 1);
  });
});

describe("access", () => {
  test("only the Owner can read or change the full settings", async () => {
    for (const who of ["manager", "coordinator", "customer"]) {
      assert.equal((await request(app).get("/api/settings").set(auth(who))).status, 403, who);
      assert.equal((await update({ businessName: "Hijacked" }, who)).status, 403, who);
    }
    assert.equal((await request(app).put("/api/settings").send({ businessName: "Hijacked" })).status, 401);
    assert.equal((await request(app).get("/api/settings").set(auth("owner"))).status, 200);
    assert.notEqual((await publicSettings()).businessName, "Hijacked");
  });
});

describe("updates", () => {
  const FULL = {
    businessName: "Spice Garden",
    tagline: "Celebrations since 1998",
    description: "Family-run banquet halls in the heart of Kochi.",
    logoUrl: "/uploads/1700000000000-abcdef123456.png",
    coverImages: ["https://res.cloudinary.com/demo/image/upload/hall.jpg", "/uploads/cover-2.webp"],
    brandColor: "#1F6F5C",
    contactEmail: "events@spicegarden.test",
    contactPhone: "0484 2345678",
    whatsapp: "+91 98765-43210",
    address: "MG Road, Kochi",
    mapUrl: "https://maps.google.com/?q=Spice+Garden+Kochi",
    policyNotes: "No outside catering.",
    cancellationPolicy: "Advance is refundable up to 30 days before the event.",
    advancePaymentPercentage: 25,
    eventTypes: ["Wedding", "Reception", "Birthday"],
    openingTime: "09:00",
    closingTime: "23:00",
    minNoticeDays: 3,
    maxAdvanceDays: 365,
  };

  test("the Owner can set every restaurant field, and the public site sees it", async () => {
    const res = await update(FULL);
    assert.equal(res.status, 200, JSON.stringify(res.body));
    const s = await publicSettings();
    assert.deepEqual(
      { ...s, timezone: undefined },
      { ...FULL, whatsapp: "9876543210", timezone: undefined }
    );
  });

  test("fields outside the editable list are ignored", async () => {
    const res = await update({ businessName: "Spice Garden", key: "other", setupCompletedAt: "2020-01-01" });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    const doc = await Settings.findOne();
    assert.equal(doc.key, "default");
    assert.equal(doc.setupCompletedAt, null);
  });

  test("partial updates leave other fields untouched", async () => {
    await update(FULL);
    await update({ tagline: "New tagline" });
    const s = await publicSettings();
    assert.equal(s.tagline, "New tagline");
    assert.equal(s.businessName, FULL.businessName);
    assert.deepEqual(s.eventTypes, FULL.eventTypes);
  });

  test("optional fields can be cleared", async () => {
    await update(FULL);
    const res = await update({ logoUrl: "", brandColor: "", whatsapp: "", mapUrl: "", openingTime: "", closingTime: "", maxAdvanceDays: "" });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    const s = await publicSettings();
    assert.equal(s.logoUrl, "");
    assert.equal(s.brandColor, "");
    assert.equal(s.whatsapp, "");
    assert.equal(s.mapUrl, "");
    assert.equal(s.openingTime, "");
    assert.equal(s.maxAdvanceDays, null);
  });

  test("event types are trimmed and de-duplicated", async () => {
    const res = await update({ eventTypes: [" Wedding ", "wedding", "", "Birthday", "BIRTHDAY", "Mehndi"] });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.deepEqual((await publicSettings()).eventTypes, ["Wedding", "Birthday", "Mehndi"]);
  });
});

describe("validation", () => {
  // `expected`: the request field the validator must name, or (for the
  // model's cross-field rules) a pattern its message must match.
  const rejects = async (body, expected) => {
    const res = await update(body);
    assert.equal(res.status, 400, `${JSON.stringify(body)} should be rejected`);
    if (expected instanceof RegExp) {
      assert.match(res.body.message, expected);
    } else {
      assert.ok(fieldErrors(res).includes(expected), `expected an error on ${expected}: ${JSON.stringify(res.body)}`);
    }
    return res;
  };

  test("rejects malformed branding and contact fields", async () => {
    await rejects({ businessName: "" }, "businessName");
    await rejects({ brandColor: "red" }, "brandColor");
    await rejects({ brandColor: "#12345" }, "brandColor");
    await rejects({ logoUrl: "javascript:alert(1)" }, "logoUrl");
    await rejects({ coverImages: ["/etc/passwd"] }, "coverImages[0]");
    await rejects({ coverImages: Array.from({ length: 11 }, (_, i) => `/uploads/c${i}.jpg`) }, "coverImages");
    await rejects({ mapUrl: "http://maps.example.com" }, "mapUrl");
    await rejects({ mapUrl: "javascript:alert(1)" }, "mapUrl");
    await rejects({ whatsapp: "12345" }, "whatsapp");
    await rejects({ contactEmail: "not-an-email" }, "contactEmail");
    await rejects({ description: "x".repeat(2001) }, "description");
  });

  test("rejects malformed booking rules", async () => {
    await rejects({ openingTime: "9am", closingTime: "23:00" }, "openingTime");
    await rejects({ openingTime: "09:00" }, /both opening and closing/); // only one of the pair
    await rejects({ openingTime: "18:00", closingTime: "09:00" }, /after opening time/);
    await rejects({ openingTime: "18:00", closingTime: "18:00" }, /after opening time/);
    await rejects({ minNoticeDays: -1 }, "minNoticeDays");
    await rejects({ minNoticeDays: 1.5 }, "minNoticeDays");
    await rejects({ maxAdvanceDays: 0 }, "maxAdvanceDays");
    await rejects({ maxAdvanceDays: true }, "maxAdvanceDays");
    await rejects({ minNoticeDays: 10, maxAdvanceDays: 10 }, /greater than the minimum notice/);
    await rejects({ eventTypes: [] }, "eventTypes");
    await rejects({ eventTypes: ["", "  "] }, "eventTypes");
    await rejects({ eventTypes: [42] }, "eventTypes[0]");
    await rejects({ advancePaymentPercentage: 0 }, "advancePaymentPercentage");
  });

  test("cross-field rules are checked against the stored values", async () => {
    assert.equal((await update({ openingTime: "09:00", closingTime: "17:00", minNoticeDays: 5 })).status, 200);
    await rejects({ closingTime: "08:00" }, /after opening time/);
    await rejects({ maxAdvanceDays: 3 }, /greater than the minimum notice/);
    const s = await publicSettings();
    assert.equal(s.closingTime, "17:00", "a rejected update changes nothing");
    assert.equal(s.maxAdvanceDays, null);
  });
});
