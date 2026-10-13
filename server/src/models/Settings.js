import mongoose from "mongoose";

// One installation serves one restaurant — exactly one Settings document
// ever exists. See settings.controller.js for the get-or-create-default logic.
// Defaults are deliberately neutral; each installation is configured with its
// restaurant's own details (scripts/setupRestaurant.js, then System Settings).
const settingsSchema = new mongoose.Schema(
  {
    businessName: {
      type: String,
      trim: true,
      default: "Our Restaurant",
    },
    tagline: {
      type: String,
      trim: true,
      default: "",
    },
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
    address: {
      type: String,
      trim: true,
      default: "",
    },
    policyNotes: {
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
  },
  { timestamps: true }
);

const Settings = mongoose.model("Settings", settingsSchema);

export default Settings;
