import { Schema, model } from "mongoose";

const ReviewSchema = new Schema(
  {
    reviewerId: {
      type: String,
      required: true,
    },
    targetUserId: {
      type: String,
      required: true,
    },
    rating: {
      type: Number,
      required: true,
      min: 1,
      max: 5,
    },
    comment: {
      type: String,
      required: true,
      trim: true,
    },
  },
  { timestamps: true }
);

export default model("Review", ReviewSchema);