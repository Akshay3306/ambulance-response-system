const transitions = {
  pending: ["dispatched", "cancelled"],
  dispatched: ["en-route", "cancelled"],
  "en-route": ["on-scene", "cancelled"],
  "on-scene": ["picked-up"],
  "picked-up": ["transporting"],
  transporting: ["completed"],
  completed: [],
  cancelled: [],
};

function canTransition(current, next) {
  return Boolean(transitions[current]?.includes(next));
}

module.exports = { canTransition };
