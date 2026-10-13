// One-time configuration of a new installation for its restaurant: the
// restaurant's settings, its Owner account and (optionally) a starting
// catalog, read from a JSON file. Used by scripts/setupRestaurant.js; kept
// here, free of any CLI concerns, so it can be tested.
//
// Safety:
//   - every value is validated with the same rules as the API, and the model
//     validation, before anything is written
//   - the file may never hold a password, secret, token or key; the Owner's
//     password is asked for separately and only when a new account is needed
//   - a completed setup (or a database that already has bookings) is never
//     overwritten unless `force` is given; even then the existing Owner's
//     password is kept and catalog types that already have items are skipped
import { body, validationResult } from "express-validator";
import Settings from "../models/Settings.js";
import User from "../models/User.js";
import Booking from "../models/Booking.js";
import Hall from "../models/Hall.js";
import Package from "../models/Package.js";
import Food from "../models/Food.js";
import Decoration from "../models/Decoration.js";
import AdditionalService from "../models/AdditionalService.js";
import { ROLES } from "../config/roles.js";
import { settingsUpdateRules } from "../validators/settings.validators.js";
import { hallCreateRules } from "../validators/hall.validators.js";
import { catalogCreateRules } from "../validators/catalogItem.validators.js";

export class SetupError extends Error {
  constructor(message, details = []) {
    super(details.length ? `${message}\n  - ${details.join("\n  - ")}` : message);
    this.details = details;
  }
}

export const MIN_OWNER_PASSWORD_LENGTH = 10;

const RESTAURANT_FIELDS = [
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
const OWNER_FIELDS = ["name", "email"];
// Same checks as account creation (auth.validators.js registerRules), minus
// the password, which never comes from the file.
const OWNER_RULES = [
  body("name").trim().notEmpty().withMessage("Name is required"),
  body("email").trim().isEmail().withMessage("A valid email is required"),
];

const CATALOG = {
  halls: { Model: Hall, rules: hallCreateRules, fields: ["name", "description", "capacity", "price", "amenities", "images"] },
  packages: { Model: Package, rules: catalogCreateRules, fields: ["name", "description", "price", "includedItems", "images"] },
  foods: { Model: Food, rules: catalogCreateRules, fields: ["name", "description", "price", "category", "images"] },
  decorations: { Model: Decoration, rules: catalogCreateRules, fields: ["name", "description", "price", "category", "images"] },
  services: {
    Model: AdditionalService,
    rules: catalogCreateRules,
    fields: ["name", "description", "price", "category", "images"],
  },
};

// Keys starting with "_" are notes for whoever edits the file; ignored.
const withoutNotes = (obj) => Object.fromEntries(Object.entries(obj || {}).filter(([k]) => !k.startsWith("_")));

const isPlainObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);

const SECRET_KEY = /pass(word)?|secret|token|api[_-]?key|private[_-]?key|credential/i;

// Paths of any keys in the config that look like they hold a secret.
const findSecretKeys = (value, path = "") => {
  if (Array.isArray(value)) return value.flatMap((v, i) => findSecretKeys(v, `${path}[${i}]`));
  if (!isPlainObject(value)) return [];
  return Object.entries(value).flatMap(([key, v]) => {
    const here = path ? `${path}.${key}` : key;
    return [...(SECRET_KEY.test(key) ? [here] : []), ...findSecretKeys(v, here)];
  });
};

// Runs express-validator rules against a plain object, exactly as the API
// does; returns the sanitized values and any error messages.
const runRules = async (rules, values, label) => {
  const req = { body: { ...values } };
  for (const rule of rules) await rule.run(req);
  const errors = validationResult(req)
    .array()
    .map((e) => `${label}.${e.path}: ${e.msg}`);
  return { values: req.body, errors };
};

const unknownKeys = (obj, allowed, label) =>
  Object.keys(obj)
    .filter((k) => !allowed.includes(k))
    .map((k) => `${label}.${k}: unknown field (allowed: ${allowed.join(", ")})`);

// Validates the whole config without writing anything. Returns the cleaned
// restaurant settings, owner details and catalog items.
const validateConfig = async (config) => {
  if (!isPlainObject(config)) throw new SetupError("The setup file must contain a JSON object");

  const secrets = findSecretKeys(config);
  if (secrets.length) {
    throw new SetupError(
      "The setup file must not contain passwords, secrets, tokens or keys. Remove these fields (the Owner's password is asked for separately):",
      secrets
    );
  }

  const top = withoutNotes(config);
  const errors = unknownKeys(top, ["restaurant", "owner", "catalog"], "config");

  // Restaurant settings — the API's own rules, then the model's cross-field rules.
  const restaurantInput = withoutNotes(top.restaurant);
  if (!isPlainObject(top.restaurant)) errors.push("restaurant: required object");
  if (!restaurantInput.businessName) errors.push("restaurant.businessName: required");
  errors.push(...unknownKeys(restaurantInput, RESTAURANT_FIELDS, "restaurant"));
  const restaurant = await runRules(settingsUpdateRules, restaurantInput, "restaurant");
  errors.push(...restaurant.errors);
  if (!restaurant.errors.length) {
    // validate() (not validateSync) so the schema's pre-validate cross-field
    // rules run too — before anything is written.
    try {
      await new Settings(restaurant.values).validate();
    } catch (modelError) {
      errors.push(...Object.values(modelError.errors || {}).map((e) => `restaurant: ${e.message}`));
      if (!modelError.errors) throw modelError;
    }
  }

  // Owner account details (the password is never in the file).
  const ownerInput = withoutNotes(top.owner);
  if (!isPlainObject(top.owner)) errors.push("owner: required object with name and email");
  errors.push(...unknownKeys(ownerInput, OWNER_FIELDS, "owner"));
  const owner = await runRules(OWNER_RULES, ownerInput, "owner");
  errors.push(...owner.errors);

  // Optional starting catalog.
  const catalogInput = withoutNotes(top.catalog);
  if (top.catalog !== undefined && !isPlainObject(top.catalog)) errors.push("catalog: must be an object");
  errors.push(...unknownKeys(catalogInput, Object.keys(CATALOG), "catalog"));
  const catalog = {};
  for (const [type, { rules, fields }] of Object.entries(CATALOG)) {
    const items = catalogInput[type];
    if (items === undefined) continue;
    if (!Array.isArray(items)) {
      errors.push(`catalog.${type}: must be an array`);
      continue;
    }
    catalog[type] = [];
    for (const [i, raw] of items.entries()) {
      const label = `catalog.${type}[${i}]`;
      if (!isPlainObject(raw)) {
        errors.push(`${label}: must be an object`);
        continue;
      }
      const item = withoutNotes(raw);
      errors.push(...unknownKeys(item, fields, label));
      const checked = await runRules(rules, item, label);
      errors.push(...checked.errors);
      catalog[type].push(checked.values);
    }
  }

  if (errors.length) throw new SetupError("The setup file has problems:", errors);
  return {
    restaurant: restaurant.values,
    owner: { name: owner.values.name, email: owner.values.email.toLowerCase() },
    catalog,
  };
};

// runSetup({ config, getOwnerPassword, force, dryRun, now })
//   getOwnerPassword: async () => string — called only when a new Owner
//   account must be created (before anything is written).
// Resolves to { dryRun, actions: [string] }.
export const runSetup = async ({ config, getOwnerPassword, force = false, dryRun = false, now = new Date() }) => {
  const { restaurant, owner, catalog } = await validateConfig(config);

  const existingSettings = await Settings.findOne().sort({ createdAt: 1 });
  const bookingCount = await Booking.countDocuments();
  if (!force && existingSettings?.setupCompletedAt) {
    throw new SetupError(
      `This installation was already set up on ${existingSettings.setupCompletedAt.toISOString()}. ` +
        "The restaurant's staff now manage its details in Restaurant Settings. " +
        "Re-run with --force only if you really mean to overwrite them."
    );
  }
  if (!force && bookingCount > 0) {
    throw new SetupError(
      `This database already has ${bookingCount} booking(s). Re-run with --force only if you really mean to configure it again.`
    );
  }

  const actions = [];
  const existingUser = await User.findOne({ email: owner.email });
  if (existingUser && existingUser.role !== ROLES.OWNER) {
    throw new SetupError(`${owner.email} already belongs to a ${existingUser.role} account; use a different Owner email.`);
  }

  let ownerPassword;
  if (existingUser) {
    actions.push(`Keep the existing Owner account ${owner.email} (password unchanged)`);
  } else {
    actions.push(`Create the Owner account ${owner.email}`);
    if (!dryRun) {
      ownerPassword = await getOwnerPassword?.();
      if (typeof ownerPassword !== "string" || ownerPassword.length < MIN_OWNER_PASSWORD_LENGTH) {
        throw new SetupError(`The Owner's password must be at least ${MIN_OWNER_PASSWORD_LENGTH} characters.`);
      }
    }
  }

  const catalogPlan = [];
  for (const [type, items] of Object.entries(catalog)) {
    if (!items.length) continue;
    const existing = await CATALOG[type].Model.countDocuments();
    if (existing > 0) {
      actions.push(`Skip ${type}: ${existing} already in the database`);
    } else {
      actions.push(`Add ${items.length} ${items.length === 1 ? type.replace(/s$/, "") : type}`);
      catalogPlan.push([type, items]);
    }
  }
  actions.push(`${existingSettings ? "Update" : "Create"} the restaurant settings for "${restaurant.businessName}"`);

  // The settings as they will be saved (merged into any existing ones),
  // validated now so a problem can't surface after other writes.
  const settings = existingSettings || new Settings();
  Object.assign(settings, restaurant, { setupCompletedAt: now });
  try {
    await settings.validate();
  } catch (error) {
    if (!error.errors) throw error;
    throw new SetupError(
      "The restaurant settings would be invalid:",
      Object.values(error.errors).map((e) => e.message)
    );
  }

  if (dryRun) return { dryRun: true, actions };

  if (!existingUser) {
    await User.create({ name: owner.name, email: owner.email, password: ownerPassword, role: ROLES.OWNER });
  }
  for (const [type, items] of catalogPlan) {
    await CATALOG[type].Model.insertMany(items);
  }
  // Settings last: setupCompletedAt marks the whole setup as done.
  await settings.save();

  return { dryRun: false, actions };
};
