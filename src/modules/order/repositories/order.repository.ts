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
      timeToStart?: Date | string | null;
      status?: string;
    },
    session?: ClientSession,
  ) {
    return OrderModel.create([data], { session }).then((docs: any[]) => docs[0]);
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
      status: { $in: [ORDER_STATUS.PENDING, ORDER_STATUS.IN_PROGRESS] },
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

  static deletePendingOrderByCustomer(
    orderId: Types.ObjectId | string,
    customerId: Types.ObjectId | string,
    session?: ClientSession,
  ) {
    return OrderModel.findOneAndDelete(
      {
        _id: orderId,
        customerId,
        status: ORDER_STATUS.PENDING,
      },
      { session },
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
