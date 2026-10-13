// Unit tests for the production-database safety guard (src/config/dbGuard.js).
// Pure string checks — nothing connects to any database.
//   npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { assertSafeMongoUri, parseMongoUri } from "../src/config/dbGuard.js";

const env = { MONGODB_DB_NAME: "bookmyhall_platform" };
const SAFE_SRV = "mongodb+srv://u:p@new-cluster.abcde.mongodb.net/bookmyhall_platform?retryWrites=true";
const SAFE_LOCAL = "mongodb://localhost:27017/bookmyhall_platform";

test("accepts this project's own database", () => {
  assert.equal(assertSafeMongoUri(SAFE_SRV, env), SAFE_SRV);
  assert.equal(assertSafeMongoUri(SAFE_LOCAL, env), SAFE_LOCAL);
});

test("refuses the original project's database name, in any case", () => {
  for (const db of ["bookmyhall", "BookMyHall"]) {
    const uri = `mongodb+srv://u:p@any.mongodb.net/${db}?w=majority`;
    assert.throws(() => assertSafeMongoUri(uri, { MONGODB_DB_NAME: db }), /blocked/);
  }
});

test("fails closed when MONGODB_DB_NAME is missing (e.g. the old .env pasted in)", () => {
  assert.throws(() => assertSafeMongoUri(SAFE_SRV, {}), /MONGODB_DB_NAME is not set/);
});

test("refuses a URI whose database differs from MONGODB_DB_NAME", () => {
  const uri = "mongodb+srv://u:p@x.mongodb.net/some_other_db";
  assert.throws(() => assertSafeMongoUri(uri, env), /but MONGODB_DB_NAME/);
});

test("refuses a URI without a database name", () => {
  assert.throws(() => assertSafeMongoUri("mongodb+srv://u:p@x.mongodb.net/?w=majority", env), /must name its database/);
  assert.throws(() => assertSafeMongoUri("mongodb://localhost:27017", env), /must name its database/);
});

test("refuses hosts listed in MONGODB_BLOCKED_HOSTS", () => {
  const blocked = { ...env, MONGODB_BLOCKED_HOSTS: " old-cluster.abcde.mongodb.net , other.host " };
  const uri = "mongodb+srv://u:p@OLD-cluster.abcde.mongodb.net/bookmyhall_platform";
  assert.throws(() => assertSafeMongoUri(uri, blocked), /MONGODB_BLOCKED_HOSTS/);
  const replicaSet = "mongodb://u:p@a.host:27017,other.host:27018/bookmyhall_platform";
  assert.throws(() => assertSafeMongoUri(replicaSet, blocked), /MONGODB_BLOCKED_HOSTS/);
  assert.equal(assertSafeMongoUri(SAFE_SRV, blocked), SAFE_SRV);
});

test("refuses malformed connection strings", () => {
  assert.throws(() => assertSafeMongoUri("postgres://x/y", env), /not a valid/);
  assert.throws(() => assertSafeMongoUri("", env), /not a valid/);
});

test("error messages never contain the credentials", () => {
  const uri = "mongodb+srv://secretuser:secretpass@x.mongodb.net/bookmyhall";
  try {
    assertSafeMongoUri(uri, env);
    assert.fail("should have thrown");
  } catch (error) {
    assert.doesNotMatch(error.message, /secretuser|secretpass/);
  }
});

test("parses hosts and database name", () => {
  assert.deepEqual(parseMongoUri("mongodb://u:p@h1:1,H2:2/db?x=1"), { hosts: ["h1", "h2"], dbName: "db" });
});
