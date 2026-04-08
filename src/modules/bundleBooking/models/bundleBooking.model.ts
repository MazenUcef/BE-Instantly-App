import mongoose, { Schema, Document, Types } from "mongoose";
import {
  BUNDLE_BOOKING_STATUS,
  BUNDLE_BOOKING_CANCELLED_BY,
  BundleBookingStatus,
  BundleBookingCancelledBy,
} from "../../../shared/constants/bundleBooking.constants";


export interface IBundleBooking extends Document {
  bundleId: Types.ObjectId;
  supplierId: Types.ObjectId;
  customerId: Types.ObjectId;
  categoryId: Types.ObjectId;
  governmentId: Types.ObjectId;
  address: string;
  notes?: string | null;
  bookedDate: string; // YYYY-MM-DD
  slotStart: string; // HH:mm
  slotEnd: string; // HH:mm
  scheduledAt: Date;
  status: BundleBookingStatus;
  paymentConfirmed: boolean;
  paymentConfirmedAt?: Date | null;
  finalPrice: number;
  rejectionReason?: string | null;
  cancelledBy?: BundleBookingCancelledBy | null;
  createdAt: Date;
  updatedAt: Date;
}

const BundleBookingSchema = new Schema<IBundleBooking>(
  {
    bundleId: {
      type: Schema.Types.ObjectId,
      ref: "Bundle",
      required: true,
      index: true,
    },
    supplierId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    customerId: {
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
    governmentId: {
      type: Schema.Types.ObjectId,
      ref: "Government",
      required: true,
      index: true,
    },
    address: {
      type: String,
      required: true,
      trim: true,
      maxlength: 500,
    },
    notes: {
      type: String,
      trim: true,
      default: null,
      maxlength: 2000,
    },
    bookedDate: {
      type: String,
      required: true,
      index: true,
    },
    slotStart: {
      type: String,
      required: true,
    },
    slotEnd: {
      type: String,
      required: true,
    },
    scheduledAt: {
      type: Date,
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: Object.values(BUNDLE_BOOKING_STATUS),
      default: BUNDLE_BOOKING_STATUS.PENDING_SUPPLIER_APPROVAL,
      index: true,
    },
    paymentConfirmed: {
      type: Boolean,
      default: false,
      index: true,
    },
    paymentConfirmedAt: {
      type: Date,
      default: null,
    },
    finalPrice: {
      type: Number,
      required: true,
      min: 1,
    },
    rejectionReason: {
      type: String,
      default: null,
      trim: true,
      maxlength: 500,
    },
    cancelledBy: {
      type: String,
      enum: [...Object.values(BUNDLE_BOOKING_CANCELLED_BY), null],
      default: null,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

BundleBookingSchema.index({ supplierId: 1, status: 1, scheduledAt: 1 });
BundleBookingSchema.index({ customerId: 1, status: 1, scheduledAt: 1 });
BundleBookingSchema.index({ bundleId: 1, scheduledAt: 1 });
BundleBookingSchema.index({
  supplierId: 1,
  bookedDate: 1,
  slotStart: 1,
  slotEnd: 1,
});
BundleBookingSchema.index({ customerId: 1, createdAt: -1 });

export default mongoose.model<IBundleBooking>(
  "BundleBooking",
  BundleBookingSchema,
);
