import mongoose, { Schema, Document } from "mongoose";

export interface IGovernment extends Document {
  name: string;
  nameAr: string;
  normalizedName: string;
  normalizedNameAr: string;
  country: string;
  isActive: boolean;
  order: number;
  createdAt: Date;
  updatedAt: Date;
}

const governmentSchema = new Schema<IGovernment>(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 100,
    },
    nameAr: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 100,
    },
    normalizedName: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      unique: true,
      index: true,
    },
    normalizedNameAr: {
      type: String,
      required: true,
      trim: true,
      unique: true,
      index: true,
    },
    country: {
      type: String,
      default: "Egypt",
      trim: true,
      maxlength: 100,
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
    order: {
      type: Number,
      default: 0,
      min: 0,
      index: true,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

governmentSchema.index({ isActive: 1, order: 1, name: 1 });
governmentSchema.index({ normalizedName: 1 }, { unique: true });
governmentSchema.index({ normalizedNameAr: 1 }, { unique: true });

export default mongoose.model<IGovernment>("Government", governmentSchema);