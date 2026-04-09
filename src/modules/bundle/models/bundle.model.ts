import mongoose, { Schema, Document, Types } from "mongoose";
import {
  BUNDLE_DEFAULT_DURATION_MINUTES,
  BUNDLE_ALLOWED_DURATIONS,
  BUNDLE_DEFAULT_IS_ACTIVE,
} from "../../../shared/constants/bundle.constants";

export interface IBundle extends Document {
  supplierId: Types.ObjectId;
  categoryId: Types.ObjectId;
  governmentIds: Types.ObjectId[];
  title: string;
  subtitle?: string | null;
  description: string;
  image?: string | null;
  price: number;
  oldPrice?: number | null;
  durationMinutes: number;
  includes: string[];
  tags: string[];
  selectedWorkflow?: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const BundleSchema = new Schema<IBundle>(
  {
    supplierId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    categoryId: {
      type: Schema.Types.ObjectId,
      ref: "Category",
      required: true,
      index: true,
    },
    governmentIds: [
      {
        type: Schema.Types.ObjectId,
        ref: "Government",
        required: true,
      },
    ],
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
    },
    subtitle: {
      type: String,
      trim: true,
      default: null,
      maxlength: 250,
    },
    description: {
      type: String,
      required: true,
      trim: true,
      maxlength: 4000,
    },
    image: {
      type: String,
      default: null,
      trim: true,
    },
    price: {
      type: Number,
      required: true,
      min: 1,
    },
    oldPrice: {
      type: Number,
      default: null,
      min: 1,
    },
    durationMinutes: {
      type: Number,
      required: true,
      default: BUNDLE_DEFAULT_DURATION_MINUTES,
      enum: BUNDLE_ALLOWED_DURATIONS,
    },
    includes: {
      type: [String],
      default: [],
    },
    tags: {
      type: [String],
      default: [],
    },
    selectedWorkflow: {
      type: String,
      default: null,
      trim: true,
    },
    isActive: {
      type: Boolean,
      default: BUNDLE_DEFAULT_IS_ACTIVE,
      index: true,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

BundleSchema.index({ supplierId: 1, isActive: 1, createdAt: -1 });
BundleSchema.index({ categoryId: 1, isActive: 1, createdAt: -1 });
BundleSchema.index({ governmentIds: 1, isActive: 1, createdAt: -1 });
BundleSchema.index({ supplierId: 1, categoryId: 1, createdAt: -1 });

export default mongoose.model<IBundle>("Bundle", BundleSchema);