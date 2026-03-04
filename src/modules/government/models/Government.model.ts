import mongoose, { Schema, Document } from "mongoose";

export interface IGovernment extends Document {
  name: string;
  nameAr: string;
  country: string;
  isActive: boolean;
  order: number;
  createdAt: Date;
  updatedAt: Date;
}

const GovernmentSchema = new Schema<IGovernment>(
  {
    name: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    nameAr: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    country: {
      type: String,
      default: "Egypt",
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    order: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: true }
);

GovernmentSchema.index({ name: 1 });
GovernmentSchema.index({ isActive: 1 });

export default mongoose.model<IGovernment>("Government", GovernmentSchema);