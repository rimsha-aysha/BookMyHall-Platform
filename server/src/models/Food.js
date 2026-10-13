import mongoose from "mongoose";

const foodSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Food item name is required"],
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
    category: {
      type: String,
      trim: true,
      default: "",
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

const Food = mongoose.model("Food", foodSchema);

export default Food;
