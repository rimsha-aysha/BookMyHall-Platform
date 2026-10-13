// Client-side view of the restaurant's booking rules (from public settings),
// used to guide customers and staff before they submit. The server enforces
// the same rules (server/src/services/bookingRules.js) — these helpers only
// mirror them for a better form experience.
import { todayInputValue, formatTime } from "./format.js";

// "YYYY-MM-DD" moved by whole calendar days.
export const addDays = (ymd, days) => {
  const date = new Date(`${ymd}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};

const isOther = (type) => type.trim().toLowerCase() === "other";

// Keeping "Other" in the list lets the customer describe their own event.
export const allowsCustomEventType = (settings) => (settings.eventTypes || []).some(isOther);

// The event-type dropdown: the restaurant's types, with "Other" (when kept)
// always last so the free-text option reads naturally.
export const eventTypeOptions = (settings) => {
  const types = (settings.eventTypes || []).filter((t) => !isOther(t));
  return allowsCustomEventType(settings) ? [...types, "Other"] : types;
};

// Bookable dates as YYYY-MM-DD: { minDate, maxDate } (maxDate "" = no limit).
// Staff overriding the rules may book from today; the days-ahead limit
// always applies.
export const bookingWindow = (settings, { override = false } = {}) => {
  const today = todayInputValue();
  const notice = override ? 0 : Number(settings.minNoticeDays) || 0;
  return {
    minDate: addDays(today, notice),
    maxDate: settings.maxAdvanceDays ? addDays(today, Number(settings.maxAdvanceDays)) : "",
  };
};

export const hasOpeningHours = (settings) => Boolean(settings.openingTime && settings.closingTime);

// A message when the times fall outside opening hours, otherwise "".
export const openingHoursProblem = (settings, startTime, endTime, { override = false } = {}) => {
  if (override || !hasOpeningHours(settings) || !startTime || !endTime) return "";
  return startTime < settings.openingTime || endTime > settings.closingTime
    ? `Events must start and end within opening hours (${formatTime(settings.openingTime)} – ${formatTime(settings.closingTime)}).`
    : "";
};

// A message when the date is outside the booking window, otherwise "".
export const dateProblem = (settings, date, options) => {
  if (!date) return "";
  const { minDate, maxDate } = bookingWindow(settings, options);
  if (date < minDate) {
    const n = Number(settings.minNoticeDays) || 0;
    return n > 0 && !options?.override
      ? `Bookings need at least ${n === 1 ? "1 day's" : `${n} days'`} notice — the earliest date is ${minDate}.`
      : "Pick today or a later date.";
  }
  if (maxDate && date > maxDate) {
    return `Bookings can be made at most ${settings.maxAdvanceDays} days ahead — the latest date is ${maxDate}.`;
  }
  return "";
};

// Short, customer-facing summary lines of the active rules.
export const rulesSummary = (settings) => {
  const lines = [];
  if (hasOpeningHours(settings)) {
    lines.push(`Events between ${formatTime(settings.openingTime)} and ${formatTime(settings.closingTime)}`);
  }
  const n = Number(settings.minNoticeDays) || 0;
  if (n > 0) lines.push(`Book at least ${n} day${n === 1 ? "" : "s"} in advance`);
  if (settings.maxAdvanceDays) lines.push(`Book up to ${settings.maxAdvanceDays} days ahead`);
  return lines;
};
