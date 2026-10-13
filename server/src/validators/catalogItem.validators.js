import { body } from "express-validator";
import { isImageRef } from "./gallery.validators.js";

// Optional photos, same rules as Hall.images (see hall.validators.js).
const imagesRules = [
  body("images").optional().isArray({ max: 30 }).withMessage("images must be an array (max 30)"),
  body("images.*")
    .optional()
    .custom(isImageRef)
    .withMessage("Each image must be an uploaded image or an http(s) URL"),
];

// Shared by Package, Food, Decoration and AdditionalService — all four have
// the same (name, description, price, category-ish, photos) shape.
export const catalogCreateRules = [
  body("name").trim().notEmpty().withMessage("Name is required"),
  body("price").isFloat({ min: 0 }).withMessage("Price must not be negative"),
  ...imagesRules,
];

export const catalogUpdateRules = [
  body("name").optional().trim().notEmpty().withMessage("Name cannot be empty"),
  body("price")
    .optional()
    .isFloat({ min: 0 })
    .withMessage("Price must not be negative"),
  ...imagesRules,
];
