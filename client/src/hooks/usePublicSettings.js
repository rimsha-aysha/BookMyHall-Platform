import { useSyncExternalStore } from "react";
import { settingsApi } from "../api/settingsApi.js";
import { EVENT_TYPES } from "../utils/booking.js";

// The restaurant's public settings — name, branding, contact details,
// policies and booking rules set by the Owner in Restaurant Settings.
// Fetched once per page load and shared by every component; saving the
// settings calls refreshPublicSettings(), which updates every component
// using them (header, footer, branding…) straight away. Falls back to
// neutral defaults if the request fails. `loaded` is false until the first
// response (or failure), so the brand isn't flashed as the default name.
const DEFAULTS = {
  loaded: false,
  businessName: "Our Restaurant",
  tagline: "",
  description: "",
  logoUrl: "",
  coverImages: [],
  brandColor: "",
  contactEmail: "",
  contactPhone: "",
  whatsapp: "",
  address: "",
  mapUrl: "",
  policyNotes: "",
  cancellationPolicy: "",
  advancePaymentPercentage: 50,
  eventTypes: EVENT_TYPES,
  openingTime: "",
  closingTime: "",
  minNoticeDays: 0,
  maxAdvanceDays: null,
  timezone: "Asia/Kolkata",
};

let snapshot = DEFAULTS;
let request = null;
const listeners = new Set();

export const refreshPublicSettings = () => {
  request = settingsApi
    .getPublic()
    .then((res) => {
      snapshot = { ...DEFAULTS, ...res.data.data, loaded: true };
      return snapshot;
    })
    .catch(() => {
      snapshot = { ...snapshot, loaded: true };
      return snapshot;
    })
    .finally(() => listeners.forEach((notify) => notify()));
  return request;
};

const subscribe = (notify) => {
  listeners.add(notify);
  if (!request) refreshPublicSettings();
  return () => listeners.delete(notify);
};

const getSnapshot = () => snapshot;

export const usePublicSettings = () => useSyncExternalStore(subscribe, getSnapshot);
