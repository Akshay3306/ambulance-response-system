function parseCoordinate(value) {
  if (typeof value !== "number" && (typeof value !== "string" || !value.trim())) return Number.NaN;
  return Number(value);
}

module.exports = { parseCoordinate };
