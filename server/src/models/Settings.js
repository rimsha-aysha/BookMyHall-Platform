import mongoose from "mongoose";
import { DEFAULT_EVENT_TYPES, BOOKING_RULE_LIMITS } from "../config/bookingRules.js";
import { INDIAN_MOBILE_REGEX, INVALID_PHONE_MESSAGE, normalizePhone } from "../utils/phone.js";

const TIME_OR_EMPTY = /^$|^([01]\d|2[0-3]):([0-5]\d)$/;
const HEX_COLOR_OR_EMPTY = /^$|^#[0-9a-fA-F]{6}$/;

// One installation serves one restaurant — exactly one Settings document
// ever exists (enforced by the unique `key`). See settings.controller.js for
// the get-or-create-default logic.
// A fresh installation shows the BookMyHall branding until it is configured
// for its restaurant (scripts/setupRestaurant.js and/or Restaurant Settings)
// — no source changes are needed per installation.
// Every field added after the original release has a default that keeps the
// earlier behaviour, so an existing Settings document needs no migration.
const settingsSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      default: "default",
      immutable: true,
      unique: true,
    },

    // ---- Restaurant profile & branding ----
    businessName: {
      type: String,
      trim: true,
      default: "BookMyHall",
    },
    tagline: {
      type: String,
      trim: true,
      default: "",
    },
    description: {
      type: String,
      trim: true,
      default: "",
    },
    // An uploaded image ("/uploads/…") or an http(s) URL; empty = no logo
    // (the site shows the name's first letter instead).
    logoUrl: {
      type: String,
      trim: true,
      default: "",
    },
    coverImages: {
      type: [String],
      default: [],
    },
    // Accent colour for buttons and links, "#rrggbb"; empty = default theme.
    brandColor: {
      type: String,
      trim: true,
      match: [HEX_COLOR_OR_EMPTY, "Accent colour must be a hex colour like #8c5d2a"],
      default: "",
    },

    // ---- Contact ----
    contactEmail: {
      type: String,
      trim: true,
      default: "",
    },
    contactPhone: {
      type: String,
      trim: true,
      default: "",
    },
    // WhatsApp number, stored as 10 bare digits like User.phone.
    whatsapp: {
      type: String,
      trim: true,
      set: normalizePhone,
      match: [new RegExp(`^$|${INDIAN_MOBILE_REGEX.source}`), INVALID_PHONE_MESSAGE],
      default: "",
    },
    address: {
      type: String,
      trim: true,
      default: "",
    },
    mapUrl: {
      type: String,
      trim: true,
      default: "",
    },

    // ---- Policies & booking rules ----
    policyNotes: {
      type: String,
      trim: true,
      default: "",
    },
    cancellationPolicy: {
      type: String,
      trim: true,
      default: "",
    },
    advancePaymentPercentage: {
      type: Number,
      min: [1, "Advance payment percentage must be at least 1"],
      max: [100, "Advance payment percentage cannot exceed 100"],
      default: 50,
    },
    eventTypes: {
      type: [String],
      default: () => [...DEFAULT_EVENT_TYPES],
    },
    // Hours customers may book within ("HH:mm"); both empty = any time.
    openingTime: {
      type: String,
      trim: true,
      match: [TIME_OR_EMPTY, "Opening time must be in HH:mm 24-hour format"],
      default: "",
    },
    closingTime: {
      type: String,
      trim: true,
      match: [TIME_OR_EMPTY, "Closing time must be in HH:mm 24-hour format"],
      default: "",
    },
    // Customers must book at least this many days before the event (0 =
    // same-day bookings allowed).
    minNoticeDays: {
      type: Number,
      min: [0, "Minimum notice cannot be negative"],
      max: [BOOKING_RULE_LIMITS.MAX_NOTICE_DAYS, `Minimum notice cannot exceed ${BOOKING_RULE_LIMITS.MAX_NOTICE_DAYS} days`],
      default: 0,
    },
    // Customers may book at most this many days ahead; null = no limit.
    maxAdvanceDays: {
      type: Number,
      min: [1, "Maximum days ahead must be at least 1"],
      max: [
        BOOKING_RULE_LIMITS.MAX_ADVANCE_DAYS,
        `Maximum days ahead cannot exceed ${BOOKING_RULE_LIMITS.MAX_ADVANCE_DAYS}`,
      ],
      default: null,
    },

    // Set by scripts/setupRestaurant.js once an installation is configured;
    // never editable through the API.
    setupCompletedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

// Rules that span two fields, checked whichever of them an update changes.
settingsSchema.pre("validate", function checkBookingRules() {
  const { openingTime, closingTime, minNoticeDays, maxAdvanceDays } = this;
  if (Boolean(openingTime) !== Boolean(closingTime)) {
    this.invalidate("closingTime", "Set both opening and closing time, or leave both empty");
  } else if (openingTime && closingTime <= openingTime) {
    this.invalidate("closingTime", "Closing time must be after opening time");
  }
  if (maxAdvanceDays != null && maxAdvanceDays <= minNoticeDays) {
    this.invalidate("maxAdvanceDays", "Maximum days ahead must be greater than the minimum notice");
  }
  if (!this.eventTypes?.length) {
    this.invalidate("eventTypes", "At least one event type is required");
  }
});

const Settings = mongoose.model("Settings", settingsSchema);

export default Settings;
