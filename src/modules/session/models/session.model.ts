import mongoose, { Schema, Document, Types } from "mongoose";
import {
  SESSION_STATUS,
  SessionStatus,
  SESSION_CANCELLED_BY,
  SessionCancelledBy,
} from "../../../shared/constants/session.constants";

export interface IJobSession extends Document {
  orderId?: Types.ObjectId | null;
  offerId?: Types.ObjectId | null;
  bundleBookingId?: Types.ObjectId | null;
  customerId: Types.ObjectId;
  supplierId: Types.ObjectId;
  workflowSteps: string[];
  stepTimestamps: Map<string, Date>;
  paymentConfirmed: boolean;
  paymentConfirmedAt?: Date | null;
  status: string;
  cancelledBy?: SessionCancelledBy | null;
  cancellationReason?: string | null;

  startedAt?: Date | null;
  completedAt?: Date | null;
  cancelledAt?: Date | null;

  createdAt: Date;
  updatedAt: Date;
}

const JobSessionSchema = new Schema<IJobSession>(
  {
    orderId: {
      type: Schema.Types.ObjectId,
      ref: "Order",
      default: null,
      index: true,
    },
    offerId: {
      type: Schema.Types.ObjectId,
      ref: "Offer",
      default: null,
      index: true,
    },
    bundleBookingId: {
      type: Schema.Types.ObjectId,
      ref: "BundleBooking",
      default: null,
      index: true,
    },
    customerId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    supplierId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    workflowSteps: {
      type: [String],
      required: true,
      default: [],
    },
    stepTimestamps: {
      type: Map,
      of: Date,
      default: {},
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
    status: {
      type: String,
      default: SESSION_STATUS.STARTED,
      index: true,
    },
    cancelledBy: {
      type: String,
      enum: Object.values(SESSION_CANCELLED_BY),
      default: null,
    },
    cancellationReason: {
      type: String,
      default: null,
      trim: true,
      maxlength: 500,
    },
    startedAt: {
      type: Date,
      default: () => new Date(),
    },
    completedAt: {
      type: Date,
      default: null,
    },
    cancelledAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

JobSessionSchema.index(
  { orderId: 1 },
  {
    unique: true,
    partialFilterExpression: {
      orderId: { $type: "objectId" },
      status: { $nin: [SESSION_STATUS.COMPLETED, SESSION_STATUS.CANCELLED] },
    },
    name: "uniq_active_orderId",
  },
);
JobSessionSchema.index(
  { offerId: 1 },
  {
    unique: true,
    partialFilterExpression: {
      offerId: { $type: "objectId" },
      status: { $nin: [SESSION_STATUS.COMPLETED, SESSION_STATUS.CANCELLED] },
    },
    name: "uniq_active_offerId",
  },
);
JobSessionSchema.index(
  { bundleBookingId: 1 },
  {
    unique: true,
    partialFilterExpression: {
      bundleBookingId: { $type: "objectId" },
      status: { $nin: [SESSION_STATUS.COMPLETED, SESSION_STATUS.CANCELLED] },
    },
    name: "uniq_active_bundleBookingId",
  },
);
JobSessionSchema.index({ customerId: 1, status: 1, updatedAt: -1 });
JobSessionSchema.index({ supplierId: 1, status: 1, updatedAt: -1 });
JobSessionSchema.index({ status: 1, updatedAt: -1 });

JobSessionSchema.index(
  { customerId: 1, status: 1 },
  {
    unique: true,
    partialFilterExpression: {
      status: { $nin: [SESSION_STATUS.COMPLETED, SESSION_STATUS.CANCELLED] },
    },
    name: "uniq_customer_single_active_session",
  },
);

JobSessionSchema.index(
  { supplierId: 1, status: 1 },
  {
    unique: true,
    partialFilterExpression: {
      status: { $nin: [SESSION_STATUS.COMPLETED, SESSION_STATUS.CANCELLED] },
    },
    name: "uniq_supplier_single_active_session",
  },
);

export default mongoose.model<IJobSession>("JobSession", JobSessionSchema);
