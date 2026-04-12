import mongoose, { Schema, Document, Types } from "mongoose";
import {
  OFFER_STATUS,
  OfferStatus,
} from "../../../shared/constants/offer.constants";

export interface IOffer extends Document {
  orderId: Types.ObjectId;
  supplierId: Types.ObjectId;
  amount: number;
  estimatedDuration?: number | null;
  numberOfDays?: number | null;
  timeToStart?: Date | null;
  status: OfferStatus;
  expiresAt?: Date | null;
  acceptedAt?: Date | null;
  rejectedAt?: Date | null;
  withdrawnAt?: Date | null;
  completedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const offerSchema = new Schema<IOffer>(
  {
    orderId: {
      type: Schema.Types.ObjectId,
      ref: "Order",
      required: true,
      index: true,
    },
    supplierId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 1,
    },
    estimatedDuration: {
      type: Number,
      default: null,
      min: 1,
    },
    numberOfDays: {
      type: Number,
      default: null,
      min: 1,
    },
    timeToStart: {
      type: Date,
      default: null,
    },
    status: {
      type: String,
      enum: Object.values(OFFER_STATUS),
      default: OFFER_STATUS.PENDING,
      index: true,
    },
    expiresAt: {
      type: Date,
      default: null,
      index: true,
    },
    acceptedAt: {
      type: Date,
      default: null,
    },
    rejectedAt: {
      type: Date,
      default: null,
    },
    withdrawnAt: {
      type: Date,
      default: null,
    },
    completedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

offerSchema.index({ orderId: 1, status: 1, createdAt: -1 });
offerSchema.index({ supplierId: 1, status: 1, createdAt: -1 });
offerSchema.index({ supplierId: 1, updatedAt: -1 });
offerSchema.index(
  { expiresAt: 1 },
  {
    expireAfterSeconds: 0,
    partialFilterExpression: { expiresAt: { $type: "date" } },
  },
);

offerSchema.index(
  { orderId: 1, supplierId: 1, status: 1 },
  {
    unique: true,
    partialFilterExpression: {
      status: OFFER_STATUS.PENDING,
    },
    name: "uniq_supplier_pending_offer_per_order",
  },
);

offerSchema.index(
  { orderId: 1, status: 1 },
  {
    unique: true,
    partialFilterExpression: {
      status: OFFER_STATUS.ACCEPTED,
    },
    name: "uniq_order_single_accepted_offer",
  },
);

offerSchema.index({ supplierId: 1, status: 1, timeToStart: 1 });

export default mongoose.model<IOffer>("Offer", offerSchema);
