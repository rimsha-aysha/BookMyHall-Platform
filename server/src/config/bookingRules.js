// Defaults and limits for the restaurant's configurable booking rules
// (stored on the Settings document). The defaults reproduce the behaviour
// from before these rules existed: any time of day, same-day bookings
// allowed, no limit on how far ahead, and the original event types.
export const DEFAULT_EVENT_TYPES = Object.freeze([
  "Wedding",
  "Birthday",
  "Engagement",
  "Corporate Event",
  "Conference",
  "Anniversary",
  "Other",
]);

export const BOOKING_RULE_LIMITS = Object.freeze({
  MAX_NOTICE_DAYS: 365,
  MAX_ADVANCE_DAYS: 1095, // about three years
  MAX_EVENT_TYPES: 30,
  MAX_EVENT_TYPE_LENGTH: 50,
});
