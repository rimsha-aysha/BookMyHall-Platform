// This release supports restaurants in India only: Indian Rupees, Indian
// mobile numbers, Razorpay, and the Asia/Kolkata time zone. Every date-based
// booking rule ("today", notice period, how far ahead) is evaluated in this
// time zone, whatever time zone the server itself runs in (Render: UTC).
export const RESTAURANT_TIMEZONE = "Asia/Kolkata";

// Today's date in the restaurant's time zone, as YYYY-MM-DD.
export const todayInRestaurant = (now = new Date()) =>
  now.toLocaleDateString("en-CA", { timeZone: RESTAURANT_TIMEZONE });

// A YYYY-MM-DD date moved by whole calendar days, as YYYY-MM-DD.
export const addDays = (ymd, days) => {
  const date = new Date(`${ymd}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};
