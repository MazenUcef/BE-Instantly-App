import mongoose from "mongoose";
import OrderModel from "../models/order.model";
import sessionModel from "../../session/models/session.model";
import UserModel from "../../auth/models/User.model";
import OfferModel from "../../offer/models/offer.model";
import governmentModel from "../../government/models/government.model";
import categoryModel from "../../category/models/category.model";
import { AppError } from "../../../shared/middlewares/errorHandler";
import { OrderRepository } from "../repositories/order.repository";
import { OrderEventService } from "./order-event.service";
import { buildSupplierOrderPayload } from "../../../shared/utils/buildSupplierOrderPayload";
import { ORDER_STATUS } from "../../../shared/constants/order.constants";
import { getIO, socketEvents, socketRooms } from "../../../shared/config/socket";
import { SESSION_STATUS } from "../../../shared/constants/session.constants";
import { OFFER_STATUS } from "../../../shared/constants/offer.constants";

export class OrderService {
  private static async validateOrderDependencies(input: {
    categoryId: string;
    governmentId: string;
    jobTitle: string;
  }) {
    const [government, category] = await Promise.all([
      governmentModel.findById(input.governmentId),
      categoryModel.findById(input.categoryId),
    ]);

    if (!government) {
      throw new AppError("Invalid government", 400);
    }

    if (!category) {
      const error = new AppError("Invalid category", 400);
      throw error;
    }

    if (!category.jobs || !category.jobs.includes(input.jobTitle)) {
      const error = new AppError("Invalid job title for this category", 400);
      (error as any).availableJobTitles = category.jobs || [];
      throw error;
    }

    return { government, category };
  }

  private static async ensureCustomerCanCreateOrder(
    customerId: string,
    dbSession?: any,
  ) {
    const [existingActiveOrder, unfinishedReview] = await Promise.all([
      OrderRepository.findCustomerActiveOrder(customerId, dbSession),
      OrderRepository.findCustomerPendingReviewOrder(customerId, dbSession),
    ]);

    if (existingActiveOrder) {
      throw new AppError(
        "You already have an active order. Please complete it before creating a new one.",
        400,
      );
    }

    if (unfinishedReview) {
      const error = new AppError(
        "You have to review and rate your last order",
        403,
      );
      (error as any).reviewRequired = true;
      (error as any).order = unfinishedReview;
      throw error;
    }
  }

  static async createOrder(input: {
    customerId: string;
    customerName: string;
    address: string;
    description: string;
    categoryId: string;
    governmentId: string;
    requestedPrice: number;
    timeToStart?: string | Date | null;
    jobTitle: string;
    orderType: "contract" | "daily";
  }) {
    const {
      customerId,
      customerName,
      address,
      description,
      categoryId,
      governmentId,
      requestedPrice,
      timeToStart,
      jobTitle,
      orderType,
    } = input;

    const dbSession = await mongoose.startSession();
    let order: any;

    try {
      await dbSession.withTransaction(async () => {
        if (!requestedPrice || requestedPrice <= 0) {
          throw new AppError("Price is required", 400);
        }

        await this.validateOrderDependencies({
          categoryId,
          governmentId,
          jobTitle,
        });

        await this.ensureCustomerCanCreateOrder(customerId, dbSession);

        order = await OrderRepository.createOrder(
          {
            customerId,
            customerName,
            address,
            description,
            categoryId,
            governmentId,
            jobTitle,
            requestedPrice,
            timeToStart: timeToStart || null,
            orderType,
            status: ORDER_STATUS.PENDING,
          },
          dbSession,
        );
      });
    } finally {
      await dbSession.endSession();
    }

    const payload = await OrderEventService.emitOrderCreated(
      order._id.toString(),
      categoryId,
      governmentId,
    );

    return {
      success: true,
      message: "Order created successfully",
      data: {
        ...payload,
        selectedJobTitle: jobTitle,
      },
    };
  }

  static async updateOrderPrice(input: {
    orderId: string;
    customerId: string;
    requestedPrice: number;
  }) {
    const { orderId, customerId, requestedPrice } = input;

    const order = await OrderRepository.findById(orderId);

    if (!order) {
      throw new AppError("Order not found", 404);
    }

    if (order.customerId.toString() !== customerId) {
      throw new AppError("Not allowed", 403);
    }

    if (order.status !== ORDER_STATUS.PENDING) {
      throw new AppError("Cannot update price now", 400);
    }

    const updatedOrder = await OrderRepository.updateRequestedPrice(
      orderId,
      requestedPrice,
    );

    if (!updatedOrder) {
      throw new AppError("Order could not be updated", 409);
    }

    const payload = await OrderEventService.emitOrderUpdated(
      updatedOrder._id.toString(),
      updatedOrder.categoryId.toString(),
      updatedOrder.governmentId.toString(),
    );

    return {
      success: true,
      message: "Price updated successfully",
      order: payload,
    };
  }

  static async deleteOrder(input: { orderId: string; customerId: string }) {
    const { orderId, customerId } = input;

    const dbSession = await mongoose.startSession();

    let deletedOrder: any = null;
    let activeSession: any = null;
    let acceptedOffer: any = null;
    let pendingOffers: any[] = [];
    let flowType: "pending_delete" | "cancel_active_session_and_delete" | null =
      null;

    try {
      await dbSession.withTransaction(async () => {
        const order = await OrderRepository.findById(orderId, dbSession);

        if (!order) {
          throw new AppError("Order not found", 404);
        }

        if (order.customerId.toString() !== customerId) {
          throw new AppError("Not allowed", 403);
        }

        if (
          ![ORDER_STATUS.PENDING, ORDER_STATUS.IN_PROGRESS].includes(
            order.status as any,
          )
        ) {
          throw new AppError(
            "Only pending or in-progress orders can be deleted by customer",
            400,
          );
        }

        pendingOffers = await OfferModel.find({
          orderId: order._id,
          status: OFFER_STATUS.PENDING,
        }).session(dbSession || null);

        activeSession = await sessionModel
          .findOne({
            orderId: order._id,
            status: {
              $nin: [SESSION_STATUS.CANCELLED, SESSION_STATUS.COMPLETED],
            },
          })
          .session(dbSession || null);

        acceptedOffer = await OfferModel.findOne({
          orderId: order._id,
          status: OFFER_STATUS.ACCEPTED,
        }).session(dbSession || null);

        if (order.status === ORDER_STATUS.PENDING) {
          await OfferModel.updateMany(
            { orderId: order._id, status: OFFER_STATUS.PENDING },
            {
              $set: {
                status: OFFER_STATUS.REJECTED,
                rejectedAt: new Date(),
              },
            },
            { session: dbSession },
          );

          deletedOrder = await OrderRepository.deletePendingOrderByCustomer(
            orderId,
            customerId,
            dbSession,
          );

          if (!deletedOrder) {
            throw new AppError("Order not found or already deleted", 409);
          }

          flowType = "pending_delete";
          return;
        }

        if (order.status === ORDER_STATUS.IN_PROGRESS) {
          if (activeSession) {
            activeSession.status = SESSION_STATUS.CANCELLED;
            activeSession.cancelledBy = "customer";
            activeSession.cancellationReason = "customer_deleted_order";
            activeSession.cancelledAt = new Date();
            await activeSession.save({ session: dbSession });
          }

          if (acceptedOffer) {
            acceptedOffer.status = OFFER_STATUS.REJECTED;
            acceptedOffer.rejectedAt = new Date();
            await acceptedOffer.save({ session: dbSession });
          }

          await OfferModel.updateMany(
            {
              orderId: order._id,
              _id: { $ne: acceptedOffer?._id },
              status: OFFER_STATUS.PENDING,
            },
            {
              $set: {
                status: OFFER_STATUS.REJECTED,
                rejectedAt: new Date(),
              },
            },
            { session: dbSession },
          );

          deletedOrder = await OrderModel.findOneAndDelete(
            {
              _id: orderId,
              customerId,
              status: ORDER_STATUS.IN_PROGRESS,
            },
            { session: dbSession },
          );

          if (!deletedOrder) {
            throw new AppError("Order not found or already deleted", 409);
          }

          flowType = "cancel_active_session_and_delete";
        }
      });
    } finally {
      await dbSession.endSession();
    }

    const io = getIO();

    await OrderEventService.notifySuppliersOrderDeleted(
      pendingOffers,
      deletedOrder._id.toString(),
    );

    if (acceptedOffer?.supplierId) {
      io.to(socketRooms.user(acceptedOffer.supplierId.toString())).emit(
        socketEvents.OFFER_REJECTED,
        {
          offerId: acceptedOffer._id.toString(),
          orderId: deletedOrder._id.toString(),
          reason: "order_deleted_by_customer",
          timestamp: new Date(),
        },
      );
    }

    if (activeSession) {
      const sessionPayload = {
        _id: activeSession._id.toString(),
        orderId: activeSession.orderId.toString(),
        offerId: activeSession.offerId.toString(),
        customerId: activeSession.customerId.toString(),
        supplierId: activeSession.supplierId.toString(),
        status: SESSION_STATUS.CANCELLED,
        cancelledBy: "customer",
        cancellationReason: "customer_deleted_order",
        cancelledAt: activeSession.cancelledAt,
      };

      io.to(socketRooms.user(activeSession.customerId.toString())).emit(
        socketEvents.SESSION_CANCELLED,
        {
          sessionId: activeSession._id.toString(),
          session: sessionPayload,
          cancelledBy: "customer",
          reason: "customer_deleted_order",
          timestamp: new Date(),
        },
      );

      io.to(socketRooms.user(activeSession.supplierId.toString())).emit(
        socketEvents.SESSION_CANCELLED,
        {
          sessionId: activeSession._id.toString(),
          session: sessionPayload,
          cancelledBy: "customer",
          reason: "customer_deleted_order",
          timestamp: new Date(),
        },
      );

      io.to(socketRooms.chat(activeSession._id.toString())).emit(
        socketEvents.SESSION_CANCELLED,
        {
          sessionId: activeSession._id.toString(),
          session: sessionPayload,
          cancelledBy: "customer",
          reason: "customer_deleted_order",
          timestamp: new Date(),
        },
      );
    }

    await OrderEventService.emitOrderDeleted(
      deletedOrder._id.toString(),
      deletedOrder.categoryId.toString(),
      deletedOrder.governmentId.toString(),
    );

    return {
      success: true,
      message:
        flowType === "cancel_active_session_and_delete"
          ? "Order deleted and active session cancelled successfully"
          : "Order deleted and offers rejected",
      data: {
        orderId: deletedOrder._id.toString(),
        sessionId: activeSession?._id?.toString() || null,
      },
    };
  }

  static async getActiveOrdersByCategory(input: {
    supplierId: string;
    supplierCategoryId: string;
    supplierGovernmentIds: string[];
  }) {
    const { supplierId, supplierCategoryId, supplierGovernmentIds } = input;

    if (!supplierGovernmentIds || supplierGovernmentIds.length === 0) {
      return {
        success: true,
        type: "orders_list",
        ordersWithOffers: [],
        availableOrders: [],
        count: {
          ordersWithOffers: 0,
          availableOrders: 0,
          total: 0,
        },
      };
    }

    const activeAcceptedOffer = await OfferModel.findOne({
      supplierId,
      status: "accepted",
    }).sort({ createdAt: -1 });

    if (activeAcceptedOffer) {
      const activeOrder = await buildSupplierOrderPayload(
        activeAcceptedOffer.orderId.toString(),
      );

      if (!activeOrder) {
        throw new AppError("Active order not found", 404);
      }

      return {
        success: true,
        type: "active_job",
        order: activeOrder,
        activeAcceptedOffer: true,
      };
    }

    const [allPendingOrders, supplierPendingOffers] = await Promise.all([
      OrderRepository.findPendingOrdersForSupplierFeed({
        categoryId: supplierCategoryId,
        governmentIds: supplierGovernmentIds,
        excludeCustomerId: supplierId,
      }),
      OfferModel.find({
        supplierId,
        status: "pending",
      }).select("orderId"),
    ]);

    const orderIdsWithOffers = new Set(
      supplierPendingOffers.map((offer: any) => offer.orderId.toString()),
    );

    const payloads = await Promise.all(
      allPendingOrders.map((order: any) =>
        buildSupplierOrderPayload(order._id.toString()),
      ),
    );

    const validPayloads = payloads.filter(Boolean);

    const ordersWithOffers: any[] = [];
    const availableOrders: any[] = [];

    for (const payload of validPayloads) {
      if (!payload) continue;
      if (orderIdsWithOffers.has(payload._id.toString())) {
        ordersWithOffers.push(payload);
      } else {
        availableOrders.push(payload);
      }
    }

    return {
      success: true,
      type: "orders_list",
      ordersWithOffers,
      availableOrders,
      count: {
        ordersWithOffers: ordersWithOffers.length,
        availableOrders: availableOrders.length,
        total: ordersWithOffers.length + availableOrders.length,
      },
    };
  }

  static async getOrderDetails(input: {
    orderId: string;
    userId: string;
    role: string;
    categoryId?: string;
    governmentIds?: string[];
  }) {
    const order = await OrderRepository.findById(input.orderId);

    if (!order) {
      throw new AppError("Order not found", 404);
    }

    if (input.role === "customer") {
      if (order.customerId.toString() !== input.userId) {
        throw new AppError("Not allowed", 403);
      }
    }

    if (input.role === "supplier") {
      const supplierGovernmentIds = new Set(
        (input.governmentIds || []).map(String),
      );

      if (
        order.categoryId.toString() !== String(input.categoryId) ||
        !supplierGovernmentIds.has(order.governmentId.toString()) ||
        order.customerId.toString() === input.userId
      ) {
        throw new AppError("Not allowed", 403);
      }
    }

    return {
      success: true,
      data: order,
    };
  }

  static async getCustomerOrderHistory(input: {
    customerId: string;
    page?: number;
    limit?: number;
  }) {
    const { customerId, page = 1, limit = 20 } = input;

    const [orders, total] = await Promise.all([
      OrderRepository.findCustomerOrders(customerId, page, limit),
      OrderRepository.countCustomerOrders(customerId),
    ]);

    return {
      success: true,
      count: orders.length,
      total,
      page,
      limit,
      orders,
    };
  }

  static async checkPendingOrders(input: { userId: string }) {
    const { userId } = input;

    const activeOrder = await OrderRepository.findCustomerActiveOrder(userId);

    if (activeOrder) {
      return {
        success: true,
        hasPendingOrders: true,
        pendingOrder: activeOrder,
        status: activeOrder.status,
        message: "You have an active order",
      };
    }

    const pendingReviewOrder =
      await OrderRepository.findCustomerPendingReviewOrder(userId);

    if (pendingReviewOrder) {
      const session = await sessionModel.findOne({
        orderId: pendingReviewOrder._id,
      });

      let supplierData = null;
      if (session?.supplierId) {
        supplierData = await UserModel.findById(session.supplierId).select(
          "-password -refreshToken -biometrics",
        );
      }

      return {
        success: true,
        hasPendingOrders: true,
        reviewRequired: true,
        pendingOrder: pendingReviewOrder,
        supplier: supplierData,
        message: "You have a completed order that needs review",
      };
    }

    return {
      success: true,
      hasPendingOrders: false,
      message: "No pending orders found",
    };
  }
}
