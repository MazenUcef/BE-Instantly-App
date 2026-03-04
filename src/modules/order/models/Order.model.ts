import mongoose, { Schema, Document } from "mongoose";

export interface IOrder extends Document {
  customerId: string;
  customerName: string;
  categoryId: string;
  address: string;
  description: string;
  requestedPrice: number;
  status: "pending" | "in_progress" | "completed";
  finalPrice?: number;
  customerReviewed: boolean;
  governmentId: string;
  supplierReviewed: boolean;
  timeToStart: Date;
}

const OrderSchema = new Schema<IOrder>(
  {
    customerId: { type: String, required: true },
    customerName: { type: String, required: true },
    categoryId: { type: String, required: true },
    address: { type: String, required: true },
    description: { type: String, required: true },
    governmentId: { type: String, required: true },
    requestedPrice: {
      type: Number,
      required: true,
      min: 1,
    },
    timeToStart: {
      type: Date,
      required: false,
    },
    status: {
      type: String,
      enum: ["pending", "in_progress", "completed"],
      default: "pending",
    },
    finalPrice: { type: Number },
    customerReviewed: { type: Boolean, default: false },
    supplierReviewed: { type: Boolean, default: false },
  },
  { timestamps: true },
);

OrderSchema.index({ customerId: 1, status: 1 });

export default mongoose.model<IOrder>("Order", OrderSchema);
