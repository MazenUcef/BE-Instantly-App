import mongoose, { Schema, Document, Types } from "mongoose";

export interface IOffer extends Document {
  orderId: Types.ObjectId;
  supplierId: Types.ObjectId;
  type: "price" | "proposal";
  amount: number;
  timeRange?: string;
  status: "pending" | "accepted" | "rejected" | "expired";
  createdAt: Date;
  updatedAt: Date;
  expiresAt: Date | null;
  timeToStart: Date;
}

const OfferSchema = new Schema<IOffer>(
  {
    orderId: { type: Schema.Types.ObjectId, required: true, ref: "Order" },
    supplierId: { type: Schema.Types.ObjectId, required: true, ref: "User" },
    type: { type: String, enum: ["price", "proposal"], required: true },
    amount: { type: Number, required: true },
    timeToStart: {
      type: Date,
      required: false,
    },
    timeRange: { type: String },
    status: {
      type: String,
      enum: ["pending", "accepted", "rejected", "expired"],
      default: "pending",
    },
    expiresAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true },
);

export default mongoose.model<IOffer>("Offer", OfferSchema);
