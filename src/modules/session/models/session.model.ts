import mongoose, { Schema, Document, Types } from "mongoose";
import {
  SESSION_STATUS,
  SESSION_ACTIVE_STATUSES,
  SessionStatus,
  SESSION_CANCELLED_BY,
  SessionCancelledBy,
} from "../../../shared/constants/session.constants";

export interface IJobSession extends Document {
  orderId: Types.ObjectId;
  offerId: Types.ObjectId;
  customerId: Types.ObjectId;
  supplierId: Types.ObjectId;
  paymentConfirmed: boolean;
  paymentConfirmedAt?: Date | null;
  status: SessionStatus;
  cancelledBy?: SessionCancelledBy | null;
  cancellationReason?: string | null;

  startedAt?: Date | null;
  onTheWayAt?: Date | null;
  arrivedAt?: Date | null;
  workStartedAt?: Date | null;
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
      required: true,
      index: true,
    },
    offerId: {
      type: Schema.Types.ObjectId,
      ref: "Offer",
      required: true,
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
      enum: Object.values(SESSION_STATUS),
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
    onTheWayAt: {
      type: Date,
      default: null,
    },
    arrivedAt: {
      type: Date,
      default: null,
    },
    workStartedAt: {
      type: Date,
      default: null,
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

JobSessionSchema.index({ orderId: 1 }, { unique: true });
JobSessionSchema.index({ offerId: 1 }, { unique: true });
JobSessionSchema.index({ customerId: 1, status: 1, updatedAt: -1 });
JobSessionSchema.index({ supplierId: 1, status: 1, updatedAt: -1 });
JobSessionSchema.index({ status: 1, updatedAt: -1 });

JobSessionSchema.index(
  { customerId: 1, status: 1 },
  {
    unique: true,
    partialFilterExpression: {
      status: { $in: [...SESSION_ACTIVE_STATUSES] },
    },
    name: "uniq_customer_single_active_session",
  },
);

JobSessionSchema.index(
  { supplierId: 1, status: 1 },
  {
    unique: true,
    partialFilterExpression: {
      status: { $in: [...SESSION_ACTIVE_STATUSES] },
    },
    name: "uniq_supplier_single_active_session",
  },
);

export default mongoose.model<IJobSession>("JobSession", JobSessionSchema);