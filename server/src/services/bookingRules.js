// The restaurant's configurable booking rules (Settings: eventTypes,
// openingTime/closingTime, minNoticeDays, maxAdvanceDays), evaluated in the
// restaurant's time zone.
//
// These are business rules layered on top of — never instead of — the
// checks in booking.validators.js (no past dates) and booking.controller.js
// (active hall, capacity, availability and double-booking prevention under
// the hall/date lock), which apply to every booking without exception.
//
// Staff entering a walk-in booking may override the customer-facing notice
// period and opening hours (e.g. a same-day event, or one running late).
// The event-type list and the maximum days ahead still apply to them.
import { todayInRestaurant, addDays } from "../config/region.js";

// The configured spelling of `eventType` (case-insensitive match), or null
// when it isn't one of the restaurant's event types.
export const matchEventType = (settings, eventType) => {
  const wanted = String(eventType ?? "").trim().toLowerCase();
  return (settings.eventTypes || []).find((type) => type.toLowerCase() === wanted) ?? null;
};

// Choosing "Other" in the booking forms lets the customer describe their own
// event type (e.g. "Product launch"), as it always has. Keeping "Other" in the
// restaurant's list keeps that option; removing it restricts bookings to the
// listed types only.
export const allowsCustomEventTypes = (settings) => matchEventType(settings, "Other") !== null;

// The event type to store: the configured spelling of a listed type, the
// customer's own wording when custom types are allowed, otherwise null.
const resolveEventType = (settings, eventType) => {
  const listed = matchEventType(settings, eventType);
  if (listed) return listed;
  const custom = String(eventType ?? "").trim();
  return custom && allowsCustomEventTypes(settings) ? custom : null;
};

const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

// Each rule returns a message when the booking breaks it, otherwise null.
const noticeRule = (settings, { eventDate }, today) => {
  if (!(settings.minNoticeDays > 0)) return null;
  const earliest = addDays(today, settings.minNoticeDays);
  return eventDate < earliest
    ? `Bookings need at least ${settings.minNoticeDays === 1 ? "1 day's" : `${settings.minNoticeDays} days'`} notice — the earliest available date is ${earliest}`
    : null;
};

const openingHoursRule = (settings, { startTime, endTime }) => {
  const { openingTime, closingTime } = settings;
  if (!openingTime || !closingTime) return null;
  return startTime < openingTime || endTime > closingTime
    ? `Events must start and end within opening hours (${openingTime}–${closingTime})`
    : null;
};

const maxAdvanceRule = (settings, { eventDate }, today) => {
  if (settings.maxAdvanceDays == null) return null;
  const latest = addDays(today, settings.maxAdvanceDays);
  return eventDate > latest
    ? `Bookings can be made at most ${plural(settings.maxAdvanceDays, "day")} ahead — the latest available date is ${latest}`
    : null;
};

// Checks a booking request against the rules. Returns
//   { error }                           — a rule is broken (and not overridden)
//   { eventType, rulesOverridden }      — allowed; eventType is the configured
//                                         spelling, rulesOverridden is true only
//                                         when an override actually waived a rule.
export const checkBookingRules = (settings, request, { allowOverride = false, now = new Date() } = {}) => {
  const eventType = resolveEventType(settings, request.eventType);
  if (!eventType) {
    return { error: `Event type must be one of: ${(settings.eventTypes || []).join(", ")}` };
  }

  const today = todayInRestaurant(now);
  const values = { ...request, eventDate: String(request.eventDate).slice(0, 10) };

  const maxAdvanceError = maxAdvanceRule(settings, values, today);
  if (maxAdvanceError) return { error: maxAdvanceError };

  const overridable = [noticeRule(settings, values, today), openingHoursRule(settings, values)].filter(Boolean);
  if (overridable.length && !allowOverride) return { error: overridable[0] };

  return { eventType, rulesOverridden: overridable.length > 0 };
};
