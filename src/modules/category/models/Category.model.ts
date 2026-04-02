import mongoose, { Schema, Document } from "mongoose";

export interface ICategory extends Document {
  name: string;
  normalizedName: string;
  description?: string | null;
  image?: string | null;
  jobs: string[];
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const categorySchema = new Schema<ICategory>(
  {
    name: {
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
    description: {
      type: String,
      default: null,
      trim: true,
      maxlength: 1000,
    },
    image: {
      type: String,
      default: null,
      trim: true,
    },
    jobs: {
      type: [String],
      default: [],
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

categorySchema.index({ isActive: 1, createdAt: -1 });
categorySchema.index({ normalizedName: 1 }, { unique: true });

export default mongoose.model<ICategory>("Category", categorySchema);