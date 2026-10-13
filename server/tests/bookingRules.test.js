// Tests for the restaurant's configurable booking rules: the rule engine
// (services/bookingRules.js) and how customer and walk-in bookings apply it.
// Runs against an in-memory MongoDB — nothing external.
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
const { default: Hall } = await import("../src/models/Hall.js");
const { default: Booking } = await import("../src/models/Booking.js");
const { default: Settings } = await import("../src/models/Settings.js");
const { generateToken } = await import("../src/utils/generateToken.js");
const { checkBookingRules, matchEventType } = await import("../src/services/bookingRules.js");
const { todayInRestaurant, addDays } = await import("../src/config/region.js");

describe("rule engine", () => {
  // 20:00 UTC on 10 March is 01:30 on 11 March in Asia/Kolkata — "today" must
  // be the restaurant's date, not the server's.
  const now = new Date("2026-03-10T20:00:00Z");
  const rules = {
    eventTypes: ["Wedding", "Birthday"],
    openingTime: "10:00",
    closingTime: "22:00",
    minNoticeDays: 2,
    maxAdvanceDays: 30,
  };
  const req = (overrides) => ({ eventType: "Wedding", eventDate: "2026-03-20", startTime: "12:00", endTime: "16:00", ...overrides });
  const check = (overrides, opts = {}) => checkBookingRules(rules, req(overrides), { now, ...opts });

  test("today is evaluated in Asia/Kolkata", () => {
    assert.equal(todayInRestaurant(now), "2026-03-11");
    assert.equal(addDays("2026-02-27", 2), "2026-03-01");
  });

  test("a booking within every rule passes with the configured event-type spelling", () => {
    assert.deepEqual(check({ eventType: "  wedding " }), { eventType: "Wedding", rulesOverridden: false });
    assert.equal(matchEventType(rules, "BIRTHDAY"), "Birthday");
    assert.equal(matchEventType(rules, "Funeral"), null);
  });

  test("event type must be one of the restaurant's types", () => {
    assert.match(check({ eventType: "Conference" }).error, /Event type must be one of: Wedding, Birthday/);
  });

  test("keeping \"Other\" in the list allows the customer's own event type, as before", () => {
    const withOther = { ...rules, eventTypes: ["Wedding", "other"] };
    assert.deepEqual(checkBookingRules(withOther, req({ eventType: "  Product launch " }), { now }), {
      eventType: "Product launch",
      rulesOverridden: false,
    });
    assert.equal(checkBookingRules(withOther, req({ eventType: "OTHER" }), { now }).eventType, "other");
    assert.ok(checkBookingRules(withOther, req({ eventType: "   " }), { now }).error);
  });

  test("minimum notice: the earliest date is today + notice days", () => {
    assert.match(check({ eventDate: "2026-03-12" }).error, /at least 2 days' notice — the earliest available date is 2026-03-13/);
    assert.equal(check({ eventDate: "2026-03-13" }).error, undefined);
    assert.match(checkBookingRules({ ...rules, minNoticeDays: 1 }, req({ eventDate: "2026-03-11" }), { now }).error, /1 day's notice/);
  });

  test("maximum days ahead: the latest date is today + max days", () => {
    assert.equal(check({ eventDate: "2026-04-10" }).error, undefined);
    assert.match(check({ eventDate: "2026-04-11" }).error, /at most 30 days ahead — the latest available date is 2026-04-10/);
  });

  test("opening hours: events must start and end within them (boundaries allowed)", () => {
    assert.equal(check({ startTime: "10:00", endTime: "22:00" }).error, undefined);
    assert.match(check({ startTime: "09:30", endTime: "12:00" }).error, /within opening hours \(10:00–22:00\)/);
    assert.match(check({ startTime: "20:00", endTime: "22:30" }).error, /opening hours/);
  });

  test("defaults (no hours, no notice, no limit) restrict nothing but the event type", () => {
    const open = { eventTypes: ["Wedding"], openingTime: "", closingTime: "", minNoticeDays: 0, maxAdvanceDays: null };
    const result = checkBookingRules(open, req({ eventDate: "2026-03-11", startTime: "00:00", endTime: "23:59" }), { now });
    assert.deepEqual(result, { eventType: "Wedding", rulesOverridden: false });
    assert.equal(checkBookingRules(open, req({ eventDate: "2031-01-01" }), { now }).error, undefined);
  });

  test("an override waives notice and opening hours only", () => {
    const sameDayLate = { eventDate: "2026-03-11", startTime: "21:00", endTime: "23:30" };
    assert.ok(check(sameDayLate).error);
    assert.deepEqual(check(sameDayLate, { allowOverride: true }), { eventType: "Wedding", rulesOverridden: true });
    assert.deepEqual(check({}, { allowOverride: true }), { eventType: "Wedding", rulesOverridden: false });
    assert.match(check({ eventDate: "2026-05-01" }, { allowOverride: true }).error, /days ahead/);
    assert.match(check({ eventType: "Conference" }, { allowOverride: true }).error, /Event type/);
  });
});

describe("bookings", () => {
  let mongo;
  let hall;
  const tokens = {};
  const auth = (who) => ({ Authorization: `Bearer ${tokens[who]}` });
  const today = () => todayInRestaurant();

  const RULES = {
    eventTypes: ["Wedding", "Birthday", "Reception"],
    openingTime: "10:00",
    closingTime: "22:00",
    minNoticeDays: 3,
    maxAdvanceDays: 60,
  };

  const body = (overrides = {}) => ({
    hall: hall._id.toString(),
    eventType: "Wedding",
    eventDate: addDays(today(), 10),
    startTime: "12:00",
    endTime: "16:00",
    guestCount: 50,
    ...overrides,
  });
  const walkIn = (overrides = {}) => body({ customerName: "Walk-in Guest", customerPhone: "9876543210", ...overrides });

  const book = (overrides) => request(app).post("/api/bookings").set(auth("customer")).send(body(overrides));
  const bookWalkIn = (overrides) =>
    request(app).post("/api/bookings/walk-in").set(auth("manager")).send(walkIn(overrides));

  before(async () => {
    mongo = await MongoMemoryServer.create();
    await mongoose.connect(mongo.getUri());
    await Settings.init();
    for (const role of ["manager", "customer"]) {
      const user = await User.create({
        name: `${role} user`,
        email: `${role}@test.local`,
        password: "secret123",
        role,
        ...(role === "customer" && { phone: "9123456780" }),
      });
      tokens[role] = generateToken(user);
    }
    hall = await Hall.create({ name: "Grand Hall", capacity: 200, price: 10000 });
  });

  after(async () => {
    await mongoose.disconnect();
    await mongo?.stop();
  });

  beforeEach(async () => {
    await Booking.deleteMany({});
    await Settings.deleteMany({});
    await Settings.create(RULES);
  });

  describe("customer bookings follow every rule", () => {
    test("a booking within the rules is accepted and stores the configured event type", async () => {
      const res = await book({ eventType: "reception" });
      assert.equal(res.status, 201, JSON.stringify(res.body));
      assert.equal(res.body.data.eventType, "Reception");
      assert.equal(res.body.data.rulesOverridden, undefined);
    });

    test("each rule is enforced", async () => {
      const cases = [
        [{ eventType: "Conference" }, /Event type must be one of/],
        [{ eventDate: addDays(today(), 2) }, /days' notice/],
        [{ eventDate: addDays(today(), 61) }, /days ahead/],
        [{ startTime: "09:00", endTime: "12:00" }, /opening hours/],
        [{ startTime: "20:00", endTime: "23:00" }, /opening hours/],
      ];
      for (const [overrides, message] of cases) {
        const res = await book(overrides);
        assert.equal(res.status, 400, JSON.stringify(overrides));
        assert.match(res.body.message, message);
      }
      assert.equal(await Booking.countDocuments(), 0);
    });

    test("custom event types are accepted only while \"Other\" is one of the restaurant's types", async () => {
      assert.equal((await book({ eventType: "Product Launch" })).status, 400);
      await Settings.updateOne({}, { eventTypes: [...RULES.eventTypes, "Other"] });
      const res = await book({ eventType: "Product Launch" });
      assert.equal(res.status, 201, JSON.stringify(res.body));
      assert.equal(res.body.data.eventType, "Product Launch");
    });

    test("customers cannot use the staff override", async () => {
      const res = await book({ eventDate: addDays(today(), 1), overrideBookingRules: true });
      assert.equal(res.status, 400);
      assert.match(res.body.message, /notice/);
    });

    test("with the default settings, behaviour is unchanged (same-day, any hours)", async () => {
      await Settings.deleteMany({});
      const res = await book({ eventDate: today(), startTime: "06:00", endTime: "23:30", eventType: "Corporate Event" });
      assert.equal(res.status, 201, JSON.stringify(res.body));
    });
  });

  describe("staff walk-in bookings", () => {
    test("follow the rules unless staff explicitly override", async () => {
      const res = await bookWalkIn({ eventDate: today(), startTime: "22:00", endTime: "23:30" });
      assert.equal(res.status, 400);
      assert.match(res.body.message, /notice|opening hours/);
    });

    test("may override notice and opening hours, and the override is recorded", async () => {
      const res = await bookWalkIn({ eventDate: today(), startTime: "21:00", endTime: "23:30", overrideBookingRules: true });
      assert.equal(res.status, 201, JSON.stringify(res.body));
      assert.equal(res.body.data.rulesOverridden, true);
      assert.equal((await Booking.findById(res.body.data._id)).rulesOverridden, true);
    });

    test("an override that waives nothing is not recorded", async () => {
      const res = await bookWalkIn({ overrideBookingRules: true });
      assert.equal(res.status, 201, JSON.stringify(res.body));
      assert.equal(res.body.data.rulesOverridden, undefined);
    });

    test("can never bypass double-booking prevention", async () => {
      const first = await book();
      assert.equal(first.status, 201);
      const clash = await bookWalkIn({ startTime: "15:00", endTime: "18:00", overrideBookingRules: true });
      assert.equal(clash.status, 409);
      assert.match(clash.body.message, /not available/);
      assert.equal(await Booking.countDocuments(), 1);
    });

    test("can never bypass past dates, capacity, event types or the days-ahead limit", async () => {
      const cases = [
        [{ eventDate: addDays(today(), -1) }, 400, /past/],
        [{ guestCount: 500 }, 400, /capacity/],
        [{ eventType: "Conference" }, 400, /Event type/],
        [{ eventDate: addDays(today(), 61) }, 400, /days ahead/],
      ];
      for (const [overrides, status, message] of cases) {
        const res = await bookWalkIn({ ...overrides, overrideBookingRules: true });
        assert.equal(res.status, status, JSON.stringify(overrides));
        const text = res.body.message === "Invalid input" ? JSON.stringify(res.body.errors) : res.body.message;
        assert.match(text, message);
      }
      assert.equal(await Booking.countDocuments(), 0);
    });

    test("the override flag must be a real boolean", async () => {
      const res = await bookWalkIn({ overrideBookingRules: "yes" });
      assert.equal(res.status, 400);
    });
  });

  describe("availability calendar", () => {
    const month = (date) => date.slice(0, 7);
    const dayOf = async (date) => {
      const res = await request(app)
        .get(`/api/bookings/availability/${hall._id}`)
        .set(auth("customer"))
        .query({ month: month(date) });
      assert.equal(res.status, 200, JSON.stringify(res.body));
      return { today: res.body.data.today, day: res.body.data.days.find((d) => d.date === date) };
    };

    test("uses the restaurant's today and treats a day as full once opening hours are used up", async () => {
      const date = addDays(today(), 10);
      const res = await book({ eventDate: date, startTime: "10:00", endTime: "21:30" });
      assert.equal(res.status, 201, JSON.stringify(res.body));

      const withHours = await dayOf(date);
      assert.equal(withHours.today, today());
      assert.equal(withHours.day.fullyBooked, true, "only 30 minutes left before closing");

      await Settings.updateOne({}, { openingTime: "", closingTime: "" });
      assert.equal((await dayOf(date)).day.fullyBooked, false, "the rest of the day is free without hours");
    });
  });
});
