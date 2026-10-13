import Settings from "../models/Settings.js";
import { RESTAURANT_TIMEZONE } from "../config/region.js";

// Fields the Owner can change from System Settings. Anything else in the
// request body (key, setupCompletedAt, timestamps, …) is ignored.
const EDITABLE_FIELDS = [
  "businessName",
  "tagline",
  "description",
  "logoUrl",
  "coverImages",
  "brandColor",
  "contactEmail",
  "contactPhone",
  "whatsapp",
  "address",
  "mapUrl",
  "policyNotes",
  "cancellationPolicy",
  "advancePaymentPercentage",
  "eventTypes",
  "openingTime",
  "closingTime",
  "minNoticeDays",
  "maxAdvanceDays",
];

// The subset shown on the customer-facing site (and used by staff pages that
// need the booking rules). Listed explicitly so a new private field can never
// leak by default.
const PUBLIC_FIELDS = EDITABLE_FIELDS;

// Lazily creates the single settings document on first access — no seed
// script needed, and every field falls back to its schema default.
// Exported so payment.controller.js can reuse it for the advance-payment
// percentage, rather than duplicating the get-or-create logic.
export const getOrCreateSettings = async () => {
  const existing = await Settings.findOne().sort({ createdAt: 1 });
  if (existing) return existing;
  try {
    return await Settings.create({});
  } catch (error) {
    // A simultaneous first request created it already (unique `key`).
    if (error?.code === 11000) return Settings.findOne({ key: "default" });
    throw error;
  }
};

export const toPublicSettings = (settings) => {
  const data = Object.fromEntries(PUBLIC_FIELDS.map((field) => [field, settings[field]]));
  data.timezone = RESTAURANT_TIMEZONE;
  return data;
};

export const getSettings = async (req, res, next) => {
  try {
    const settings = await getOrCreateSettings();
    res.json({ success: true, data: settings });
  } catch (error) {
    next(error);
  }
};

export const updateSettings = async (req, res, next) => {
  try {
    const settings = await getOrCreateSettings();
    EDITABLE_FIELDS.forEach((field) => {
      if (req.body[field] !== undefined) settings[field] = req.body[field];
    });
    await settings.save(); // model validation covers the cross-field rules
    res.json({ success: true, data: settings });
  } catch (error) {
    next(error);
  }
};

// Public subset shown across the customer-facing site. Everything else stays
// owner-only.
export const getPublicSettings = async (req, res, next) => {
  try {
    const settings = await getOrCreateSettings();
    res.json({ success: true, data: toPublicSettings(settings) });
  } catch (error) {
    next(error);
  }
};
