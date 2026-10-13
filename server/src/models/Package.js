import mongoose from "mongoose";

const packageSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Package name is required"],
      trim: true,
    },
    description: {
      type: String,
      trim: true,
      default: "",
    },
    price: {
      type: Number,
      required: [true, "Price is required"],
      min: [0, "Price must not be negative"],
    },
    includedItems: {
      type: [String],
      default: [],
    },
    // Photos shown to customers, same forms as Hall.images (uploaded
    // "/uploads/…" paths or http(s) URLs); the first is the cover. Items
    // created before photos existed simply have none.
    images: {
      type: [String],
      default: [],
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

const Package = mongoose.model("Package", packageSchema);

export default Package;
