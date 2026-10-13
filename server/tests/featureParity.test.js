// End-to-end check that every feature of the original BookMyHall still works
// in BookMyHall-Platform, walked through as one restaurant's real workflow:
// accounts and roles, catalog management, bookings, payments (Razorpay
// stubbed, offline), walk-ins, coordinators, tasks, issues, reviews,
// gallery, suggestions, calendars, reports and restaurant settings.
// In-memory MongoDB only — no real database, Cloudinary or Razorpay.
//   npm test
import { test, before, after, describe } from "node:test";
import assert from "node:assert/strict";
import crypto from "crypto";
import fs from "fs";
import mongoose from "mongoose";
import request from "supertest";
import { MongoMemoryServer } from "mongodb-memory-server";

process.env.JWT_SECRET = "test-secret";
process.env.RAZORPAY_KEY_ID = "rzp_test_dummykey";
process.env.RAZORPAY_KEY_SECRET = "dummy_secret";
process.env.NODE_ENV = "production"; // silences request logging
for (const key of ["CLOUDINARY_CLOUD_NAME", "CLOUDINARY_API_KEY", "CLOUDINARY_API_SECRET"]) delete process.env[key];

const { default: app } = await import("../src/app.js");
const { default: User } = await import("../src/models/User.js");
const { default: Booking } = await import("../src/models/Booking.js");
const { getRazorpay, toPaise } = await import("../src/config/razorpay.js");
const { UPLOAD_DIR } = await import("../src/routes/upload.routes.js");
const { todayInRestaurant, addDays } = await import("../src/config/region.js");

let mongo;
const tokens = {};
const ids = {};
const uploaded = [];
const auth = (who) => ({ Authorization: `Bearer ${tokens[who]}` });
const api = {
  get: (path, who) => (who ? request(app).get(path).set(auth(who)) : request(app).get(path)),
  post: (path, body, who) => (who ? request(app).post(path).set(auth(who)) : request(app).post(path)).send(body),
  put: (path, body, who) => request(app).put(path).set(auth(who)).send(body),
  patch: (path, body, who) => request(app).patch(path).set(auth(who)).send(body),
  del: (path, who) => request(app).delete(path).set(auth(who)),
};
const ok = (res, status = 200) => {
  assert.equal(res.status, status, `${res.req?.method} ${res.req?.path}: ${JSON.stringify(res.body).slice(0, 300)}`);
  return res.body.data;
};
const day = (n) => addDays(todayInRestaurant(), n);

before(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  // The Owner is created by the setup script in a real installation.
  const owner = await User.create({ name: "Owner", email: "owner@hall.test", password: "owner-password-1", role: "owner" });
  ids.owner = owner._id.toString();
  tokens.owner = (await api.post("/api/auth/login", { email: "owner@hall.test", password: "owner-password-1" })).body.token;
});

after(async () => {
  for (const file of uploaded) fs.rmSync(`${UPLOAD_DIR}/${file}`, { force: true });
  await mongoose.disconnect();
  await mongo?.stop();
});

describe("accounts, roles and permissions", () => {
  test("customers register, log in, read and update their profile", async () => {
    const reg = await api.post("/api/auth/register", { name: "Cust One", email: "c1@hall.test", password: "secret123", phone: "9876543210" });
    ok(reg, 201);
    assert.equal(reg.body.user.role, "customer", "public registration always creates a customer");
    const login = await api.post("/api/auth/login", { email: "c1@hall.test", password: "secret123" });
    tokens.customer = login.body.token;
    const me = await api.get("/api/auth/me", "customer");
    assert.equal(me.status, 200);
    assert.equal(me.body.user.email, "c1@hall.test");
    ok(await api.patch("/api/auth/me", { phone: "+91 98765 00000" }, "customer"));
    assert.equal((await api.post("/api/auth/login", { email: "c1@hall.test", password: "wrong" })).status, 401);

    const reg2 = await api.post("/api/auth/register", { name: "Cust Two", email: "c2@hall.test", password: "secret123", phone: "9876543211" });
    tokens.customer2 = reg2.body.token;
    const escalate = await api.post("/api/auth/register", { name: "X", email: "x@hall.test", password: "secret123", phone: "9876543212", role: "owner" });
    assert.equal(escalate.body.user.role, "customer", "role in the body is ignored");
  });

  test("the Owner creates managers and coordinators and controls manager permissions", async () => {
    const created = await api.post("/api/auth/managers", { name: "Manager", email: "m@hall.test", password: "secret123" }, "owner");
    assert.equal(created.status, 201);
    ids.manager = created.body.user._id;
    tokens.manager = (await api.post("/api/auth/login", { email: "m@hall.test", password: "secret123" })).body.token;

    await api.post("/api/auth/managers", { name: "Limited", email: "lm@hall.test", password: "secret123" }, "owner");
    const limited = await User.findOne({ email: "lm@hall.test" });
    ok(await api.patch(`/api/auth/managers/${limited._id}/permissions`, { permissions: { catalogManagement: false } }, "owner"));
    tokens.limited = (await api.post("/api/auth/login", { email: "lm@hall.test", password: "secret123" })).body.token;

    ok(await api.post("/api/auth/coordinators", { name: "Coord", email: "co@hall.test", password: "secret123" }, "manager"), 201);
    ids.coordinator = (await User.findOne({ email: "co@hall.test" }))._id.toString();
    tokens.coordinator = (await api.post("/api/auth/login", { email: "co@hall.test", password: "secret123" })).body.token;
    assert.ok(ok(await api.get("/api/auth/coordinators", "manager")).some((c) => c.email === "co@hall.test"));
    assert.ok(ok(await api.get("/api/auth/managers", "owner")).length >= 2);
  });

  test("each role is limited to its own areas", async () => {
    assert.equal((await api.get("/api/reports/overview")).status, 401);
    assert.equal((await api.get("/api/reports/overview", "customer")).status, 403);
    assert.equal((await api.get("/api/reports/overview", "manager")).status, 403);
    assert.equal((await api.post("/api/auth/managers", { name: "a", email: "a@hall.test", password: "secret123" }, "manager")).status, 403);
    assert.equal((await api.post("/api/halls", { name: "H", capacity: 1, price: 1 }, "coordinator")).status, 403);
    assert.equal((await api.post("/api/halls", { name: "H", capacity: 1, price: 1 }, "limited")).status, 403, "revoked permission");
    assert.equal((await api.put("/api/settings", { businessName: "X" }, "manager")).status, 403, "settings are Owner-only");
  });
});

describe("restaurant content (catalog)", () => {
  test("halls, packages, food, decorations and services: add, edit prices/photos, hide, show", async () => {
    const photos = ["/uploads/hall-1.jpg", "https://example.com/hall-2.jpg"];
    ids.hall = ok(await api.post("/api/halls", { name: "Grand Hall", capacity: 200, price: 50000, amenities: ["Stage"], images: photos }, "manager"), 201)._id;
    ids.hall2 = ok(await api.post("/api/halls", { name: "Garden", capacity: 80, price: 15000 }, "manager"), 201)._id;
    ids.package = ok(await api.post("/api/packages", { name: "Classic", price: 20000, includedItems: ["Decor"] }, "manager"), 201)._id;
    ids.food = ok(await api.post("/api/foods", { name: "Buffet", price: 5000, category: "Mains" }, "manager"), 201)._id;
    ids.decoration = ok(await api.post("/api/decorations", { name: "Floral stage", price: 3000 }, "manager"), 201)._id;
    ids.service = ok(await api.post("/api/services", { name: "Photography", price: 2000 }, "manager"), 201)._id;

    const edited = ok(await api.put(`/api/halls/${ids.hall}`, { price: 60000, description: "Our biggest hall" }, "owner"));
    assert.equal(edited.price, 60000);
    assert.equal(ok(await api.get(`/api/halls/${ids.hall}`)).price, 60000, "customers see the new price");
    assert.deepEqual(ok(await api.get(`/api/halls/${ids.hall}`)).images, photos);
    ok(await api.put(`/api/foods/${ids.food}`, { price: 5500 }, "manager"));

    ok(await api.patch(`/api/decorations/${ids.decoration}/status`, { isActive: false }, "manager"));
    assert.equal(ok(await api.get("/api/decorations")).length, 0, "hidden from customers");
    assert.equal(ok(await api.get("/api/decorations/manage/all", "manager")).length, 1, "still visible to staff");
    ok(await api.patch(`/api/decorations/${ids.decoration}/status`, { isActive: true }, "manager"));
  });

  test("unbooked items can be removed", async () => {
    const temp = ok(await api.post("/api/services", { name: "Temporary", price: 1 }, "manager"), 201)._id;
    ok(await api.del(`/api/services/${temp}`, "manager"));
    assert.equal((await api.get(`/api/services/${temp}`)).status, 404);
  });

  test("photos upload through the existing upload endpoint", async () => {
    const png = Buffer.from(
      "89504e470d0a1a0a0000000d4948445200000001000000010806000000" +
        "1f15c4890000000d49444154789c6360000002000154a24f5d0000000049454e44ae426082",
      "hex"
    );
    const res = await request(app).post("/api/uploads/images").set(auth("owner")).attach("images", png, { filename: "logo.png", contentType: "image/png" });
    const [url] = ok(res, 201);
    assert.match(url, /^\/uploads\/[\w.-]+\.png$/);
    uploaded.push(url.replace("/uploads/", ""));
    assert.equal((await request(app).get(url)).status, 200, "served back to the site");
    assert.equal((await request(app).post("/api/uploads/images").set(auth("customer")).attach("images", png, "x.png")).status, 403);
  });
});

describe("bookings, payments and event management", () => {
  const sign = (orderId, paymentId) =>
    crypto.createHmac("sha256", process.env.RAZORPAY_KEY_SECRET).update(`${orderId}|${paymentId}`).digest("hex");

  test("customer booking: availability, server-side pricing, double-booking prevention", async () => {
    const slot = { hall: ids.hall, eventDate: day(20), startTime: "12:00", endTime: "16:00", guestCount: 150 };
    const check = ok(await api.get(`/api/bookings/check-availability?${new URLSearchParams(slot)}`, "customer"));
    assert.equal(check.available, true);

    const booking = ok(
      await api.post(
        "/api/bookings",
        { ...slot, eventType: "Wedding", package: ids.package, food: [ids.food], decorations: [ids.decoration], services: [ids.service], estimatedCost: 1 },
        "customer"
      ),
      201
    );
    ids.booking = booking._id;
    assert.equal(booking.status, "pending");
    assert.equal(booking.estimatedCost, 60000 + 20000 + 5500 + 3000 + 2000, "priced on the server, not from the client");

    const clash = await api.post("/api/bookings", { ...slot, startTime: "15:00", endTime: "18:00", eventType: "Birthday" }, "customer2");
    assert.equal(clash.status, 409, "overlapping booking refused");
    assert.equal(ok(await api.get(`/api/bookings/check-availability?${new URLSearchParams(slot)}`, "customer2")).available, false);
    assert.equal(ok(await api.get("/api/bookings/my", "customer")).length, 1);
    assert.equal((await api.get(`/api/bookings/${ids.booking}`, "customer2")).status, 403, "customers only see their own bookings");
  });

  test("approval, rejection and status rules", async () => {
    const other = ok(await api.post("/api/bookings", { hall: ids.hall2, eventType: "Birthday", eventDate: day(25), startTime: "10:00", endTime: "12:00", guestCount: 20 }, "customer2"), 201);
    assert.equal(ok(await api.patch(`/api/bookings/${other._id}/status`, { status: "rejected" }, "manager")).status, "rejected");
    assert.equal((await api.patch(`/api/bookings/${ids.booking}/status`, { status: "completed" }, "manager")).status, 400, "no skipping steps");
    assert.equal((await api.patch(`/api/bookings/${ids.booking}/status`, { status: "confirmed" }, "manager")).status, 400, "only payment confirms");
    const approved = ok(await api.patch(`/api/bookings/${ids.booking}/status`, { status: "approved" }, "manager"));
    assert.equal(approved.status, "approved");
    assert.equal(String(approved.decidedBy?._id ?? approved.decidedBy), ids.manager);
  });

  test("Razorpay advance payment and verification (stubbed) confirms the booking", async () => {
    const rzp = getRazorpay();
    const orders = new Map();
    rzp.orders.create = async ({ amount, currency }) => {
      const id = `order_${crypto.randomBytes(7).toString("hex")}`;
      orders.set(id, { id, amount, currency, status: "created" });
      return orders.get(id);
    };
    rzp.orders.fetch = async (id) => orders.get(id);

    const order = ok(await api.post(`/api/payments/${ids.booking}/order`, {}, "customer"), 201);
    const total = 90500;
    assert.equal(order.advanceAmount, Math.round(total * 0.5), "default 50% advance");
    const paymentId = `pay_${crypto.randomBytes(6).toString("hex")}`;
    rzp.payments.fetch = async () => ({ id: paymentId, order_id: order.orderId, amount: toPaise(order.advanceAmount), currency: "INR", status: "captured", method: "upi", created_at: Math.floor(Date.now() / 1000) });

    const forged = await api.post(`/api/payments/${ids.booking}/verify`, { razorpay_order_id: order.orderId, razorpay_payment_id: paymentId, razorpay_signature: "f".repeat(64) }, "customer");
    assert.equal(forged.status, 400, "forged signature refused");
    ok(await api.post(`/api/payments/${ids.booking}/verify`, { razorpay_order_id: order.orderId, razorpay_payment_id: paymentId, razorpay_signature: sign(order.orderId, paymentId) }, "customer"));
    const booking = await Booking.findById(ids.booking);
    assert.equal(booking.status, "confirmed");
    assert.equal(booking.paymentStatus, "partially_paid");

    // The balance is received at the restaurant and recorded offline.
    ok(await api.post(`/api/payments/booking/${ids.booking}/offline`, { amount: total - order.advanceAmount, method: "cash", paymentDate: todayInRestaurant(), confirmReceived: true }, "manager"), 201);
    const summary = ok(await api.get(`/api/payments/booking/${ids.booking}`, "customer"));
    assert.equal(summary.totalPaid, total);
    assert.equal(summary.paymentStatus, "paid");
  });

  test("coordinator assignment, preparation tasks, issues and completion", async () => {
    const assigned = ok(await api.patch(`/api/bookings/${ids.booking}/coordinator`, { coordinatorId: ids.coordinator }, "manager"));
    assert.equal(String(assigned.coordinator?._id ?? assigned.coordinator), ids.coordinator);
    assert.equal(ok(await api.get("/api/bookings/coordinator/my", "coordinator")).length, 1);

    const tasks = ok(await api.get(`/api/tasks/booking/${ids.booking}`, "coordinator"));
    assert.ok(tasks.length > 0, "tasks generated from the booking's selections");
    assert.equal((await api.patch(`/api/bookings/${ids.booking}/preparation-status`, { preparationStatus: "completed" }, "coordinator")).status, 400, "can't finish with open tasks");
    for (const t of tasks) ok(await api.patch(`/api/tasks/${t._id}/status`, { status: "completed" }, "coordinator"));
    ok(await api.patch(`/api/bookings/${ids.booking}/preparation-status`, { preparationStatus: "completed" }, "coordinator"));

    const issue = ok(await api.post(`/api/issues/booking/${ids.booking}`, { title: "Projector cable missing" }, "coordinator"), 201);
    assert.ok(ok(await api.get("/api/issues", "manager")).some((i) => i._id === issue._id));
    assert.equal(ok(await api.patch(`/api/issues/${issue._id}/status`, { status: "resolved" }, "manager")).status, "resolved");

    ok(await api.patch(`/api/bookings/${ids.booking}/status`, { status: "upcoming" }, "manager"));
    assert.equal((await api.patch(`/api/bookings/${ids.booking}/status`, { status: "completed" }, "manager")).status, 400, "not before the event date");
    await Booking.updateOne({ _id: ids.booking }, { eventDate: new Date(day(-1)) }); // the event has now taken place
    assert.equal(ok(await api.patch(`/api/bookings/${ids.booking}/status`, { status: "completed" }, "manager")).status, "completed");
  });

  test("reviews of completed events", async () => {
    ok(await api.post(`/api/reviews/booking/${ids.booking}`, { rating: 5, comment: "Wonderful evening" }, "customer"), 201);
    assert.equal((await api.post(`/api/reviews/booking/${ids.booking}`, { rating: 4 }, "customer")).status, 409, "one review per booking");
    const reviews = ok(await api.get(`/api/reviews/hall/${ids.hall}`));
    assert.equal(reviews.count, 1);
    assert.equal(reviews.average, 5);
    assert.equal(reviews.reviews[0].comment, "Wonderful evening");
  });

  test("walk-in booking without an online request, then offline payments", async () => {
    const walkIn = ok(
      await api.post("/api/bookings/walk-in", { hall: ids.hall2, eventType: "Birthday", eventDate: day(15), startTime: "18:00", endTime: "21:00", guestCount: 40, customerName: "Walk-in Guest", customerPhone: "9123456789", food: [ids.food] }, "manager"),
      201
    );
    assert.equal(walkIn.source, "walk_in");
    assert.equal(walkIn.status, "approved", "entered by staff, so already accepted");
    assert.equal(walkIn.customer, null, "no customer account needed");

    const rec = ok(await api.post(`/api/payments/booking/${walkIn._id}/offline`, { amount: 5000, method: "upi", reference: "UTR123456", paymentDate: todayInRestaurant() }, "manager"), 201);
    assert.equal((await Booking.findById(walkIn._id)).status, "approved", "unconfirmed money doesn't count");
    ok(await api.post(`/api/payments/offline/${rec.payment._id}/confirm`, {}, "manager"));
    let b = await Booking.findById(walkIn._id);
    assert.equal(b.amountPaid, 5000);
    assert.equal(b.status, "approved", "Rs. 5,000 is below the 50% advance of Rs. 10,250");

    // The rest of the advance, recorded and confirmed in one step, confirms it.
    ok(await api.post(`/api/payments/booking/${walkIn._id}/offline`, { amount: 5250, method: "cash", paymentDate: todayInRestaurant(), confirmReceived: true }, "manager"), 201);
    b = await Booking.findById(walkIn._id);
    assert.equal(b.amountPaid, 10250);
    assert.equal(b.status, "confirmed");
    assert.equal(b.paymentStatus, "partially_paid");
    assert.ok(ok(await api.get("/api/bookings/manage/all", "manager")).some((x) => x._id === walkIn._id && x.source === "walk_in"));
  });

  test("availability and staff calendars", async () => {
    const month = day(15).slice(0, 7);
    const avail = ok(await api.get(`/api/bookings/availability/${ids.hall2}?month=${month}`, "customer"));
    assert.ok(avail.days.some((d) => d.date === day(15)), "walk-in blocks the customer calendar");
    assert.equal(JSON.stringify(avail).includes("Walk-in Guest"), false, "no customer details exposed");
    const cal = await api.get(`/api/bookings/calendar?month=${month}`, "manager");
    ok(cal);
  });
});

describe("gallery, suggestions, reports and settings", () => {
  test("gallery entries: create with photos, publish/unpublish, public list", async () => {
    const entry = ok(await api.post("/api/gallery", { title: "Summer wedding", eventType: "Wedding", hall: ids.hall, images: ["/uploads/g1.jpg"] }, "manager"), 201);
    assert.ok(ok(await api.get("/api/gallery")).some((e) => e._id === entry._id));
    ok(await api.patch(`/api/gallery/${entry._id}/publish`, { isPublished: false }, "manager"));
    assert.equal(ok(await api.get("/api/gallery")).some((e) => e._id === entry._id), false);
    ok(await api.patch(`/api/gallery/${entry._id}/publish`, { isPublished: true }, "manager"));
  });

  test("smart suggestions recommend from the restaurant's own catalog", async () => {
    const data = ok(await api.post("/api/suggestions", { eventType: "Wedding", guestCount: 120 }, "customer"));
    const text = JSON.stringify(data);
    assert.ok(text.includes("Grand Hall") || text.includes("Garden"), "suggests this restaurant's halls");
    assert.ok(data.engine?.provider);
  });

  test("owner and manager dashboards and reports", async () => {
    const overview = ok(await api.get("/api/reports/overview", "owner"));
    assert.ok(overview.bookings.total >= 3);
    assert.ok(overview.revenue.totalRevenue >= 95500);
    assert.equal(overview.halls.total, 2);
    assert.ok(ok(await api.get("/api/reports/manager-overview", "manager")).totalBookings >= 3);
    assert.ok(ok(await api.get("/api/reports/customers", "owner")).length >= 2);
    assert.ok(ok(await api.get("/api/reports/payments", "owner")).length >= 3);
  });

  test("restaurant settings saved by the Owner appear on the customer site", async () => {
    assert.equal(ok(await api.get("/api/settings/public")).businessName, "BookMyHall", "fresh installation default");
    ok(await api.put("/api/settings", { businessName: "Spice Garden", logoUrl: "/uploads/logo.png", coverImages: ["/uploads/c1.jpg", "/uploads/c2.jpg"], brandColor: "#1f6f5c", contactPhone: "0484 123456", whatsapp: "9876543210", address: "MG Road", mapUrl: "https://maps.google.com/?q=x", advancePaymentPercentage: 30 }, "owner"));
    const pub = ok(await api.get("/api/settings/public"));
    assert.equal(pub.businessName, "Spice Garden");
    assert.equal(pub.coverImages.length, 2);
    assert.equal(pub.advancePaymentPercentage, 30);
    // New advance percentage is used for the next online payment.
    const b = ok(await api.post("/api/bookings", { hall: ids.hall, eventType: "Wedding", eventDate: day(40), startTime: "10:00", endTime: "12:00", guestCount: 10 }, "customer"), 201);
    ok(await api.patch(`/api/bookings/${b._id}/status`, { status: "approved" }, "manager"));
    const order = ok(await api.post(`/api/payments/${b._id}/order`, {}, "customer"), 201);
    assert.equal(order.advanceAmount, Math.round(60000 * 0.3));
  });
});
