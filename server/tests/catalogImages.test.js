// Photos on food items, decorations, packages and services, run against an
// in-memory MongoDB — nothing external (no image is uploaded anywhere).
//   npm test
import { test, before, after, describe } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import request from "supertest";
import { MongoMemoryServer } from "mongodb-memory-server";

process.env.JWT_SECRET = "test-secret";
process.env.NODE_ENV = "production"; // silences request logging

const { default: app } = await import("../src/app.js");
const { default: User } = await import("../src/models/User.js");
const { default: Food } = await import("../src/models/Food.js");
const { default: Decoration } = await import("../src/models/Decoration.js");
const { default: Package } = await import("../src/models/Package.js");
const { default: AdditionalService } = await import("../src/models/AdditionalService.js");
const { generateToken } = await import("../src/utils/generateToken.js");

let mongo;
const tokens = {};
const auth = (who) => ({ Authorization: `Bearer ${tokens[who]}` });

const RESOURCES = [
  { path: "/api/foods", Model: Food },
  { path: "/api/decorations", Model: Decoration },
  { path: "/api/packages", Model: Package },
  { path: "/api/services", Model: AdditionalService },
];

const PHOTOS = ["/uploads/1700000000000-abcdef123456.jpg", "https://res.cloudinary.com/demo/image/upload/dish.jpg"];

before(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  const mk = async (key, role, extra = {}) => {
    const user = await User.create({ name: key, email: `${key}@test.local`, password: "secret123", role, ...extra });
    tokens[key] = generateToken(user);
  };
  await mk("manager", "manager");
  await mk("noCatalogManager", "manager", { permissions: { catalogManagement: false } });
  await mk("customer", "customer", { phone: "9123456780" });
});

after(async () => {
  await mongoose.disconnect();
  await mongo?.stop();
});

for (const { path, Model } of RESOURCES) {
  describe(path, () => {
    test("photos can be added, reordered and removed, and customers see them", async () => {
      const created = await request(app).post(path).set(auth("manager")).send({ name: "Item", price: 500, images: PHOTOS });
      assert.equal(created.status, 201, JSON.stringify(created.body));
      assert.deepEqual(created.body.data.images, PHOTOS);
      const id = created.body.data._id;

      const listed = await request(app).get(path);
      assert.deepEqual(listed.body.data.find((i) => i._id === id).images, PHOTOS);
      assert.deepEqual((await request(app).get(`${path}/${id}`)).body.data.images, PHOTOS);

      const reordered = await request(app).put(`${path}/${id}`).set(auth("manager")).send({ images: [...PHOTOS].reverse() });
      assert.equal(reordered.status, 200, JSON.stringify(reordered.body));
      assert.deepEqual(reordered.body.data.images, [...PHOTOS].reverse());

      const cleared = await request(app).put(`${path}/${id}`).set(auth("manager")).send({ images: [] });
      assert.deepEqual(cleared.body.data.images, []);
    });

    test("photos are optional, and items from before photos existed still work", async () => {
      const created = await request(app).post(path).set(auth("manager")).send({ name: "No photo", price: 100 });
      assert.equal(created.status, 201);
      assert.deepEqual(created.body.data.images, []);

      const { insertedId } = await Model.collection.insertOne({ name: "Legacy", price: 50, isActive: true });
      const legacy = await request(app).get(`${path}/${insertedId}`);
      assert.equal(legacy.status, 200);
      assert.deepEqual(legacy.body.data.images, []);
      const edited = await request(app).put(`${path}/${insertedId}`).set(auth("manager")).send({ price: 60 });
      assert.equal(edited.status, 200);
      assert.equal(edited.body.data.price, 60);
    });

    test("rejects unsafe or malformed photo references", async () => {
      for (const images of [["javascript:alert(1)"], ["/etc/passwd"], [42], "not-an-array", Array(31).fill(PHOTOS[0])]) {
        const res = await request(app).post(path).set(auth("manager")).send({ name: "Bad", price: 1, images });
        assert.equal(res.status, 400, JSON.stringify(images).slice(0, 60));
      }
    });

    test("only staff with catalog management can change photos", async () => {
      const { body } = await request(app).post(path).set(auth("manager")).send({ name: "Guarded", price: 1 });
      for (const who of ["customer", "noCatalogManager"]) {
        const res = await request(app).put(`${path}/${body.data._id}`).set(auth(who)).send({ images: PHOTOS });
        assert.equal(res.status, 403, who);
      }
      assert.deepEqual((await Model.findById(body.data._id)).images, []);
    });
  });
}
