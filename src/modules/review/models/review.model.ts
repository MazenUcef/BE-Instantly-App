import mongoose, { Schema, Types, Document } from "mongoose";

export interface IReview extends Document {
  reviewerId: Types.ObjectId;
  targetUserId: Types.ObjectId;
  orderId: Types.ObjectId;
  sessionId?: Types.ObjectId | null;
  rating: number;
  comment: string;
  createdAt: Date;
  updatedAt: Date;
}

const ReviewSchema = new Schema<IReview>(
  {
    reviewerId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    targetUserId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    orderId: {
      type: Schema.Types.ObjectId,
      ref: "Order",
      required: true,
      index: true,
    },
    sessionId: {
      type: Schema.Types.ObjectId,
      ref: "JobSession",
      default: null,
      index: true,
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
      minlength: 2,
      maxlength: 1000,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

ReviewSchema.index({ reviewerId: 1, orderId: 1 }, { unique: true });
ReviewSchema.index({ targetUserId: 1, createdAt: -1 });
ReviewSchema.index({ orderId: 1, createdAt: -1 });

export default mongoose.model<IReview>("Review", ReviewSchema);