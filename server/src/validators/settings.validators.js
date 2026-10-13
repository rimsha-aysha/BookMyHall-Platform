import { body } from "express-validator";
import { isImageRef } from "./gallery.validators.js";
import { BOOKING_RULE_LIMITS } from "../config/bookingRules.js";
import { normalizePhone, isValidIndianMobile, INVALID_PHONE_MESSAGE } from "../utils/phone.js";

const TIME_FORMAT = /^([01]\d|2[0-3]):([0-5]\d)$/;
const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;
const MAX_COVER_IMAGES = 10;

// Text fields that may be cleared (sent as "") but are capped in length.
const optionalText = (field, max, label) =>
  body(field)
    .optional()
    .isString()
    .withMessage(`${label} must be text`)
    .bail()
    .trim()
    .isLength({ max })
    .withMessage(`${label} must be at most ${max} characters`);

// "" clears the field; anything else must pass `check`.
const emptyOr = (check) => (value) => value === "" || check(value);

// Trims, drops blanks and removes case-insensitive duplicates, keeping the
// first spelling of each event type.
const cleanEventTypes = (value) => {
  if (!Array.isArray(value)) return value;
  const seen = new Set();
  return value
    .map((type) => (typeof type === "string" ? type.trim() : type))
    .filter((type) => {
      if (typeof type !== "string") return true; // left for the validator to reject
      const k = type.toLowerCase();
      if (!type || seen.has(k)) return false;
      seen.add(k);
      return true;
    });
};

export const settingsUpdateRules = [
  // ---- Profile & branding ----
  body("businessName")
    .optional()
    .isString()
    .bail()
    .trim()
    .notEmpty()
    .withMessage("Business name cannot be empty")
    .bail()
    .isLength({ max: 100 })
    .withMessage("Business name must be at most 100 characters"),
  optionalText("tagline", 160, "Tagline"),
  optionalText("description", 2000, "Description"),
  body("logoUrl")
    .optional()
    .isString()
    .bail()
    .trim()
    .custom(emptyOr(isImageRef))
    .withMessage("Logo must be an uploaded image or an http(s) URL"),
  body("coverImages")
    .optional()
    .isArray({ max: MAX_COVER_IMAGES })
    .withMessage(`coverImages must be an array (max ${MAX_COVER_IMAGES})`),
  body("coverImages.*").custom(isImageRef).withMessage("Each cover photo must be an uploaded image or an http(s) URL"),
  body("brandColor")
    .optional()
    .isString()
    .bail()
    .trim()
    .custom(emptyOr((v) => HEX_COLOR.test(v)))
    .withMessage("Accent colour must be a hex colour like #8c5d2a"),

  // ---- Contact ----
  body("contactEmail")
    .optional({ checkFalsy: true })
    .isEmail()
    .withMessage("Contact email must be a valid email"),
  optionalText("contactPhone", 30, "Contact phone"),
  body("whatsapp")
    .optional()
    .isString()
    .bail()
    .customSanitizer(normalizePhone)
    .custom(emptyOr(isValidIndianMobile))
    .withMessage(`WhatsApp: ${INVALID_PHONE_MESSAGE}`),
  optionalText("address", 300, "Address"),
  body("mapUrl")
    .optional()
    .isString()
    .bail()
    .trim()
    .custom(emptyOr((v) => /^https:\/\/\S+$/i.test(v) && v.length <= 1000))
    .withMessage("Map link must be an https:// URL"),

  // ---- Policies & booking rules ----
  optionalText("policyNotes", 3000, "Policy notes"),
  optionalText("cancellationPolicy", 3000, "Cancellation policy"),
  body("advancePaymentPercentage")
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage("Advance payment percentage must be between 1 and 100")
    .toInt(),
  body("eventTypes")
    .optional()
    .customSanitizer(cleanEventTypes)
    .isArray({ min: 1, max: BOOKING_RULE_LIMITS.MAX_EVENT_TYPES })
    .withMessage(`Provide between 1 and ${BOOKING_RULE_LIMITS.MAX_EVENT_TYPES} event types`),
  body("eventTypes.*")
    .isString()
    .withMessage("Each event type must be text")
    .bail()
    .isLength({ max: BOOKING_RULE_LIMITS.MAX_EVENT_TYPE_LENGTH })
    .withMessage(`Each event type must be at most ${BOOKING_RULE_LIMITS.MAX_EVENT_TYPE_LENGTH} characters`),
  ...["openingTime", "closingTime"].map((field) =>
    body(field)
      .optional()
      .isString()
      .bail()
      .trim()
      .custom(emptyOr((v) => TIME_FORMAT.test(v)))
      .withMessage(`${field === "openingTime" ? "Opening" : "Closing"} time must be in HH:mm 24-hour format`)
  ),
  body("minNoticeDays")
    .optional()
    .isInt({ min: 0, max: BOOKING_RULE_LIMITS.MAX_NOTICE_DAYS })
    .withMessage(`Minimum notice must be between 0 and ${BOOKING_RULE_LIMITS.MAX_NOTICE_DAYS} days`)
    .toInt(),
  // null or "" = no limit.
  body("maxAdvanceDays")
    .optional()
    .customSanitizer((v) => (v === "" ? null : v))
    .custom(
      (v) =>
        v === null ||
        ((Number.isInteger(v) || (typeof v === "string" && /^\d+$/.test(v))) &&
          Number(v) >= 1 &&
          Number(v) <= BOOKING_RULE_LIMITS.MAX_ADVANCE_DAYS)
    )
    .withMessage(`Maximum days ahead must be between 1 and ${BOOKING_RULE_LIMITS.MAX_ADVANCE_DAYS}, or empty for no limit`)
    .customSanitizer((v) => (v === null ? null : Number(v))),
];
