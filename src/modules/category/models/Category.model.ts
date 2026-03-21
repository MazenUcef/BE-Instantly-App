import { Schema, model } from "mongoose";

const CategorySchema = new Schema(
  {
    name: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    description: String,
    image: {
      type: String,
      required: false,
    },
    jobs: {
      type: [String],
      default: [],
    },
  },
  { timestamps: true },
);

export default model("Category", CategorySchema);