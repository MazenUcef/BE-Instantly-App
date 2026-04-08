import mongoose, { Schema, Document, Types } from "mongoose";
import {
  ORDER_STATUS,
  ORDER_TYPE,
  OrderStatus,
  OrderType,
  ORDER_CANCELLED_BY,
  OrderCancelledBy,
} from "../../../shared/constants/order.constants";

export interface IOrder extends Document {
  customerId: Types.ObjectId;
  customerName: string;
  supplierId?: Types.ObjectId | null;
  categoryId: Types.ObjectId;
  governmentId: Types.ObjectId;
  jobTitle: string;
  address: string;
  description: string;
  requestedPrice: number;
  orderType: OrderType;
  selectedWorkflow: string;
  status: OrderStatus;
  finalPrice?: number | null;
  customerReviewed: boolean;
  supplierReviewed: boolean;
  timeToStart?: Date | null;
  cancelledBy?: OrderCancelledBy | null;
  cancellationReason?: string | null;
  cancelledAt?: Date | null;
  completedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const orderSchema = new Schema<IOrder>(
  {
    customerId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    customerName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 150,
    },
    supplierId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
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
    jobTitle: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
    },
    address: {
      type: String,
      required: true,
      trim: true,
      maxlength: 500,
    },
    description: {
      type: String,
      required: true,
      trim: true,
      maxlength: 5000,
    },
    requestedPrice: {
      type: Number,
      required: true,
      min: 1,
    },
    orderType: {
      type: String,
      enum: Object.values(ORDER_TYPE),
      required: true,
      default: ORDER_TYPE.DAILY,
    },
    selectedWorkflow: {
      type: String,
      required: true,
      trim: true,
    },
    timeToStart: {
      type: Date,
      default: null,
    },
    status: {
      type: String,
      enum: Object.values(ORDER_STATUS),
      default: ORDER_STATUS.PENDING,
      index: true,
    },
    finalPrice: {
      type: Number,
      default: null,
      min: 0,
    },
    customerReviewed: {
      type: Boolean,
      default: false,
      index: true,
    },
    supplierReviewed: {
      type: Boolean,
      default: false,
      index: true,
    },
    cancelledBy: {
      type: String,
      enum: Object.values(ORDER_CANCELLED_BY),
      default: null,
    },
    cancellationReason: {
      type: String,
      default: null,
      maxlength: 500,
    },
    cancelledAt: {
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

orderSchema.index({ categoryId: 1, governmentId: 1, status: 1, createdAt: -1 });
orderSchema.index({ customerId: 1, status: 1, createdAt: -1 });
orderSchema.index({ supplierId: 1, status: 1, updatedAt: -1 });
orderSchema.index({
  customerId: 1,
  customerReviewed: 1,
  status: 1,
  updatedAt: -1,
});

orderSchema.index(
  { customerId: 1, status: 1 },
  {
    unique: true,
    partialFilterExpression: {
      status: { $in: [ORDER_STATUS.PENDING, ORDER_STATUS.IN_PROGRESS] },
    },
    name: "uniq_customer_single_active_order",
  },
);

export default mongoose.model<IOrder>("Order", orderSchema);