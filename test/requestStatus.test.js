const test = require("node:test");
const assert = require("node:assert/strict");
const { canTransition } = require("../src/lib/requestStatus");

test("dispatch and response statuses follow the required sequence", () => {
  assert.equal(canTransition("pending", "dispatched"), true);
  assert.equal(canTransition("dispatched", "en-route"), true);
  assert.equal(canTransition("en-route", "on-scene"), true);
  assert.equal(canTransition("on-scene", "picked-up"), true);
  assert.equal(canTransition("picked-up", "transporting"), true);
  assert.equal(canTransition("transporting", "completed"), true);
  assert.equal(canTransition("on-scene", "completed"), false);
  assert.equal(canTransition("picked-up", "completed"), false);
});

test("terminal statuses cannot be reopened", () => {
  assert.equal(canTransition("completed", "en-route"), false);
  assert.equal(canTransition("cancelled", "dispatched"), false);
});

test("unknown statuses are rejected", () => {
  assert.equal(canTransition("unknown", "completed"), false);
  assert.equal(canTransition("pending", "unknown"), false);
});
