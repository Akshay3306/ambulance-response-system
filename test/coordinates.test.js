const test = require("node:test");
const assert = require("node:assert/strict");
const { parseCoordinate } = require("../src/lib/coordinates");

test("coordinates accept numbers and non-empty numeric strings", () => {
  assert.equal(parseCoordinate(17.385), 17.385);
  assert.equal(parseCoordinate("78.4867"), 78.4867);
});

test("coordinates reject empty and non-numeric inputs", () => {
  for (const value of [undefined, null, "", " ", true, {}, "not-a-coordinate"]) {
    assert.equal(Number.isNaN(parseCoordinate(value)), true);
  }
});
