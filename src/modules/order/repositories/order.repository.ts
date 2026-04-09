import { ClientSession, Types } from "mongoose";
import { ORDER_STATUS } from "../../../shared/constants/order.constants";
import OrderModel from "../models/Order.model";

export class OrderRepository {
  static createOrder(
    data: {
      customerId: Types.ObjectId | string;
      customerName: string;
      categoryId: Types.ObjectId | string;
      governmentId: Types.ObjectId | string;
      jobTitle: string;
      address: string;
      description: string;
      requestedPrice: number;
      orderType: string;
      selectedWorkflow: string;
      timeToStart?: Date | string | null;
      images?: { url: string; publicId: string }[];
      files?: { url: string; publicId: string; originalName: string }[];
      status?: string;
    },
    session?: ClientSession,
  ) {
    return OrderModel.create([data], { session }).then((docs: any[]) => docs[0]);
  }

  static findCustomerPendingOrder(
    customerId: Types.ObjectId | string,
    session?: ClientSession,
  ) {
    return OrderModel.findOne({
      customerId,
      status: ORDER_STATUS.PENDING,
    }).session(session || null);
  }

  static findCustomerInProgressOrder(
    customerId: Types.ObjectId | string,
    session?: ClientSession,
  ) {
    return OrderModel.findOne({
      customerId,
      status: ORDER_STATUS.IN_PROGRESS,
    }).session(session || null);
  }

  static markScheduled(
    orderId: Types.ObjectId | string,
    supplierId: Types.ObjectId | string,
    finalPrice: number,
    scheduledAt: Date,
    estimatedDuration: number | null,
    session?: ClientSession,
  ) {
    return OrderModel.findOneAndUpdate(
      { _id: orderId, status: ORDER_STATUS.PENDING },
      {
        $set: {
          status: ORDER_STATUS.SCHEDULED,
          supplierId,
          finalPrice,
          scheduledAt,
          estimatedDuration,
        },
      },
      { new: true, session },
    );
  }

  static findDueScheduledOrders(session?: ClientSession) {
    return OrderModel.find({
      status: ORDER_STATUS.SCHEDULED,
      scheduledAt: { $lte: new Date() },
    }).session(session || null);
  }

  static findCustomerScheduledWindows(
    customerId: Types.ObjectId | string,
    session?: ClientSession,
  ) {
    return OrderModel.find({
      customerId,
      status: { $in: [ORDER_STATUS.SCHEDULED, ORDER_STATUS.IN_PROGRESS] },
      scheduledAt: { $ne: null },
      estimatedDuration: { $ne: null },
    })
      .select("scheduledAt estimatedDuration")
      .session(session || null);
  }

  static findSupplierScheduledWindows(
    supplierId: Types.ObjectId | string,
    session?: ClientSession,
  ) {
    return OrderModel.find({
      supplierId,
      status: { $in: [ORDER_STATUS.SCHEDULED, ORDER_STATUS.IN_PROGRESS] },
      scheduledAt: { $ne: null },
      estimatedDuration: { $ne: null },
    })
      .select("scheduledAt estimatedDuration")
      .session(session || null);
  }

  static findCustomerTimeline(
    customerId: Types.ObjectId | string,
    page = 1,
    limit = 20,
  ) {
    const skip = (page - 1) * limit;
    return OrderModel.find({ customerId })
      .sort({ scheduledAt: 1, timeToStart: 1, createdAt: -1 })
      .skip(skip)
      .limit(limit);
  }

  static countCustomerTimeline(customerId: Types.ObjectId | string) {
    return OrderModel.countDocuments({ customerId });
  }

  static findById(orderId: Types.ObjectId | string, session?: ClientSession) {
    return OrderModel.findById(orderId).session(session || null);
  }

  static findCustomerActiveOrder(
    customerId: Types.ObjectId | string,
    session?: ClientSession,
  ) {
    return OrderModel.findOne({
      customerId,
      status: { $in: [ORDER_STATUS.PENDING, ORDER_STATUS.SCHEDULED, ORDER_STATUS.IN_PROGRESS] },
    })
      .sort({ createdAt: -1 })
      .session(session || null);
  }

  static findCustomerPendingReviewOrder(
    customerId: Types.ObjectId | string,
    session?: ClientSession,
  ) {
    return OrderModel.findOne({
      customerId,
      status: ORDER_STATUS.COMPLETED,
      customerReviewed: false,
    })
      .sort({ createdAt: -1 })
      .session(session || null);
  }

  static updateRequestedPrice(
    orderId: Types.ObjectId | string,
    requestedPrice: number,
    session?: ClientSession,
  ) {
    return OrderModel.findOneAndUpdate(
      {
        _id: orderId,
        status: ORDER_STATUS.PENDING,
      },
      {
        $set: { requestedPrice },
      },
      { new: true, session },
    );
  }

  static markCancelled(
    input: {
      orderId: Types.ObjectId | string;
      customerId?: Types.ObjectId | string;
      cancelledBy: string;
      cancellationReason?: string | null;
    },
    session?: ClientSession,
  ) {
    const filter: any = {
      _id: input.orderId,
      status: { $in: [ORDER_STATUS.PENDING, ORDER_STATUS.SCHEDULED, ORDER_STATUS.IN_PROGRESS] },
    };

    if (input.customerId) {
      filter.customerId = input.customerId;
    }

    return OrderModel.findOneAndUpdate(
      filter,
      {
        $set: {
          status: ORDER_STATUS.CANCELLED,
          cancelledBy: input.cancelledBy,
          cancellationReason: input.cancellationReason || null,
          cancelledAt: new Date(),
        },
      },
      { new: true, session },
    );
  }

  static markInProgress(
    orderId: Types.ObjectId | string,
    supplierId: Types.ObjectId | string,
    finalPrice: number,
    session?: ClientSession,
  ) {
    return OrderModel.findOneAndUpdate(
      {
        _id: orderId,
        status: ORDER_STATUS.PENDING,
      },
      {
        $set: {
          status: ORDER_STATUS.IN_PROGRESS,
          supplierId,
          finalPrice,
        },
      },
      { new: true, session },
    );
  }

  static markCompleted(
    orderId: Types.ObjectId | string,
    session?: ClientSession,
  ) {
    return OrderModel.findOneAndUpdate(
      {
        _id: orderId,
        status: ORDER_STATUS.IN_PROGRESS,
      },
      {
        $set: {
          status: ORDER_STATUS.COMPLETED,
          completedAt: new Date(),
        },
      },
      { new: true, session },
    );
  }

  static findCustomerOrders(
    customerId: Types.ObjectId | string,
    page = 1,
    limit = 20,
  ) {
    const skip = (page - 1) * limit;

    return OrderModel.find({ customerId })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);
  }

  static countCustomerOrders(customerId: Types.ObjectId | string) {
    return OrderModel.countDocuments({ customerId });
  }

  static resetToPending(
    orderId: Types.ObjectId | string,
    session?: ClientSession,
  ) {
    return OrderModel.findOneAndUpdate(
      {
        _id: orderId,
        status: { $in: [ORDER_STATUS.IN_PROGRESS, ORDER_STATUS.SCHEDULED] },
      },
      {
        $set: {
          status: ORDER_STATUS.PENDING,
          supplierId: null,
          finalPrice: null,
          scheduledAt: null,
          estimatedDuration: null,
        },
      },
      { new: true, session },
    );
  }

  static findPendingOrdersForSupplierFeed(input: {
    categoryId: Types.ObjectId | string;
    governmentIds: (Types.ObjectId | string)[];
    excludeCustomerId?: Types.ObjectId | string;
  }) {
    const query: any = {
      categoryId: input.categoryId,
      governmentId: { $in: input.governmentIds },
      status: ORDER_STATUS.PENDING,
    };

    if (input.excludeCustomerId) {
      query.customerId = { $ne: input.excludeCustomerId };
    }

    return OrderModel.find(query).sort({ createdAt: -1 });
  }
}