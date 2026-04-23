import prisma from "../../../shared/config/prisma";
import {
  OrderStatus,
  OfferStatus,
  SessionStatus,
  Prisma,
} from "@prisma/client";
import { AppError } from "../../../shared/middlewares/errorHandler";
import { OrderRepository } from "../repositories/order.repository";
import { OrderEventService } from "./order-event.service";
import { buildSupplierOrderPayload } from "../../../shared/utils/buildSupplierOrderPayload";
import {
  ORDER_CANCELLED_BY,
  ORDER_MODE,
  ORDER_STATUS,
  OrderMode,
} from "../../../shared/constants/order.constants";
import { getIO, socketEvents, socketRooms } from "../../../shared/config/socket";
import { SESSION_CANCELLED_BY } from "../../../shared/constants/session.constants";
import { SessionEventService } from "../../session/services/session-event.service";
import {
  assertValidOrderTransition,
  canCustomerCancelOrder,
} from "../helpers/order-state";
import { uploadFileToCloudinary } from "../../../shared/utils/cloudinary";

type Tx = Prisma.TransactionClient;

export class OrderService {
  private static async validateOrderDependencies(input: {
    categoryId: string;
    governmentId: string;
    jobTitle: string;
    selectedWorkflow: string;
  }) {
    const [government, category] = await Promise.all([
      prisma.government.findUnique({ where: { id: input.governmentId } }),
      prisma.category.findUnique({
        where: { id: input.categoryId },
        include: { workflows: true },
      }),
    ]);

    if (!government) throw new AppError("Invalid government", 400);
    if (!category) throw new AppError("Invalid category", 400);

    if (!category.jobs || !category.jobs.includes(input.jobTitle)) {
      const error = new AppError("Invalid job title for this category", 400);
      (error as any).availableJobTitles = category.jobs || [];
      throw error;
    }

    const workflow = category.workflows.find((w) => w.key === input.selectedWorkflow);
    if (!workflow) {
      const error = new AppError("Invalid workflow for this category", 400);
      (error as any).availableWorkflows = category.workflows.map((w) => w.key);
      throw error;
    }

    return { government, category };
  }

  private static async ensureCustomerCanCreateOrder(customerId: string, tx?: Tx) {
    const [inProgressOrder, pendingOrder, unfinishedReview] = await Promise.all([
      OrderRepository.findCustomerInProgressOrder(customerId, tx),
      OrderRepository.findCustomerPendingOrder(customerId, tx),
      OrderRepository.findCustomerPendingReviewOrder(customerId, tx),
    ]);

    if (inProgressOrder) {
      throw new AppError(
        "You have an active job session in progress. Complete it before creating a new order.",
        400,
      );
    }
    if (pendingOrder) {
      throw new AppError("You already have a pending order waiting for offers.", 400);
    }
    if (unfinishedReview) {
      const error = new AppError("You have to review and rate your last order", 403);
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
    orderMode: OrderMode;
    selectedWorkflow: string;
    expectedDays?: number | null;
    estimatedDuration?: number | null;
    imageFiles?: Express.Multer.File[];
    docFiles?: Express.Multer.File[];
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
      orderMode,
      selectedWorkflow,
      expectedDays,
      estimatedDuration,
      imageFiles = [],
      docFiles = [],
    } = input;

    if (orderMode !== ORDER_MODE.IMMEDIATE && orderMode !== ORDER_MODE.SCHEDULED) {
      throw new AppError("orderMode must be 'immediate' or 'scheduled'", 400);
    }

    const normalizedTimeToStart =
      orderMode === ORDER_MODE.SCHEDULED ? (timeToStart ?? null) : null;
    if (orderMode === ORDER_MODE.SCHEDULED && !normalizedTimeToStart) {
      throw new AppError("timeToStart is required for scheduled orders", 400);
    }

    const normalizedExpectedDays =
      orderType === "daily" ? expectedDays ?? null : null;
    if (orderType === "daily" && (!normalizedExpectedDays || normalizedExpectedDays < 1)) {
      throw new AppError("expectedDays is required for daily orders", 400);
    }

    const normalizedEstimatedDuration =
      orderType === "contract" ? estimatedDuration ?? null : null;
    if (
      orderType === "contract" &&
      (!normalizedEstimatedDuration || normalizedEstimatedDuration < 1)
    ) {
      throw new AppError("estimatedDuration is required for contract orders", 400);
    }

    const [uploadedImages, uploadedFiles] = await Promise.all([
      Promise.all(imageFiles.map((file) => uploadFileToCloudinary(file, "orders/images"))),
      Promise.all(docFiles.map((file) => uploadFileToCloudinary(file, "orders/files"))),
    ]);

    const images = uploadedImages.map((r) => ({ url: r.secure_url, publicId: r.public_id }));
    const files = uploadedFiles.map((r, i) => ({
      url: r.secure_url,
      publicId: r.public_id,
      originalName: docFiles[i].originalname,
    }));

    if (!requestedPrice || requestedPrice <= 0) {
      throw new AppError("Price is required", 400);
    }

    await this.validateOrderDependencies({
      categoryId,
      governmentId,
      jobTitle,
      selectedWorkflow,
    });

    const order = await prisma.$transaction(async (tx) => {
      await this.ensureCustomerCanCreateOrder(customerId, tx);
      return OrderRepository.createOrder(
        {
          customerId,
          customerName,
          address,
          description,
          categoryId,
          governmentId,
          jobTitle,
          requestedPrice,
          timeToStart: normalizedTimeToStart,
          orderType,
          orderMode,
          selectedWorkflow,
          expectedDays: normalizedExpectedDays,
          estimatedDuration: normalizedEstimatedDuration,
          images,
          files,
          status: OrderStatus.pending,
        },
        tx,
      );
    });

    const payload = await OrderEventService.emitOrderCreated(
      order.id,
      categoryId,
      governmentId,
      input.customerId,
    );

    return {
      success: true,
      message: "Order created successfully",
      data: { ...payload, selectedJobTitle: jobTitle },
    };
  }

  static async updateOrderPrice(input: {
    orderId: string;
    customerId: string;
    requestedPrice: number;
  }) {
    const { orderId, customerId, requestedPrice } = input;

    const order = await OrderRepository.findById(orderId);
    if (!order) throw new AppError("Order not found", 404);
    if (order.customerId !== customerId) throw new AppError("Not allowed", 403);
    if (order.status !== OrderStatus.pending) {
      throw new AppError("Cannot update price now", 400);
    }

    const updatedOrder = await OrderRepository.updateRequestedPrice(
      orderId,
      requestedPrice,
    );
    if (!updatedOrder) throw new AppError("Order could not be updated", 409);

    const payload = await OrderEventService.emitOrderUpdated(
      updatedOrder.id,
      updatedOrder.categoryId,
      updatedOrder.governmentId,
    );

    return { success: true, message: "Price updated successfully", data: payload };
  }

  static async cancelOrder(input: {
    orderId: string;
    customerId: string;
    cancellationReason?: string;
  }) {
    const { orderId, customerId, cancellationReason } = input;

    const result = await prisma.$transaction(async (tx) => {
      const order = await OrderRepository.findById(orderId, tx);
      if (!order) throw new AppError("Order not found", 404);
      if (order.customerId !== customerId) throw new AppError("Not allowed", 403);

      if (!canCustomerCancelOrder(order.status)) {
        throw new AppError(
          "Only pending, scheduled, or in-progress orders can be cancelled",
          400,
        );
      }

      assertValidOrderTransition(order.status, ORDER_STATUS.CANCELLED);

      const pendingOffers = await tx.offer.findMany({
        where: { orderId: order.id, status: OfferStatus.pending },
      });

      const activeSession = await tx.jobSession.findFirst({
        where: {
          orderId: order.id,
          status: { notIn: [SessionStatus.cancelled, SessionStatus.completed] },
        },
      });

      const acceptedOffer = await tx.offer.findFirst({
        where: { orderId: order.id, status: OfferStatus.accepted },
      });

      await tx.offer.updateMany({
        where: { orderId: order.id, status: OfferStatus.pending },
        data: { status: OfferStatus.rejected, rejectedAt: new Date() },
      });

      if (acceptedOffer) {
        await tx.offer.update({
          where: { id: acceptedOffer.id },
          data: { status: OfferStatus.rejected, rejectedAt: new Date() },
        });
      }

      if (activeSession) {
        await tx.jobSession.update({
          where: { id: activeSession.id },
          data: {
            status: SessionStatus.cancelled,
            cancelledBy: SESSION_CANCELLED_BY.CUSTOMER as any,
            cancellationReason: cancellationReason || "customer_cancelled_order",
            cancelledAt: new Date(),
          },
        });
      }

      const cancelledOrder = await OrderRepository.markCancelled(
        {
          orderId,
          customerId,
          cancelledBy: ORDER_CANCELLED_BY.CUSTOMER,
          cancellationReason: cancellationReason || "customer_cancelled_order",
        },
        tx,
      );
      if (!cancelledOrder) {
        throw new AppError("Order not found or already cancelled", 409);
      }

      const flowType =
        order.status === OrderStatus.in_progress
          ? "cancel_active_session_and_order"
          : order.status === OrderStatus.scheduled
          ? "scheduled_cancel"
          : "pending_cancel";

      return { cancelledOrder, activeSession, acceptedOffer, pendingOffers, flowType };
    });

    const { cancelledOrder, activeSession, acceptedOffer, pendingOffers, flowType } =
      result;

    const io = getIO();

    await OrderEventService.notifySuppliersOrderCancelled(
      pendingOffers,
      cancelledOrder.id,
      "order_cancelled_by_customer",
    );

    if (acceptedOffer?.supplierId) {
      io.to(socketRooms.user(acceptedOffer.supplierId)).emit(
        socketEvents.OFFER_REJECTED,
        {
          offerId: acceptedOffer.id,
          orderId: cancelledOrder.id,
          reason: "order_cancelled_by_customer",
          timestamp: new Date(),
        },
      );
    }

    if (activeSession) {
      const sessionPayload = {
        _id: activeSession.id,
        orderId: activeSession.orderId,
        offerId: activeSession.offerId,
        customerId: activeSession.customerId,
        supplierId: activeSession.supplierId,
        status: SessionStatus.cancelled,
        cancelledBy: SESSION_CANCELLED_BY.CUSTOMER,
        cancellationReason:
          activeSession.cancellationReason || "customer_cancelled_order",
        cancelledAt: activeSession.cancelledAt,
      };

      SessionEventService.emitSessionCancelled(sessionPayload, {
        actorRole: SESSION_CANCELLED_BY.CUSTOMER,
        actorId: customerId,
        reason: cancellationReason || "customer_cancelled_order",
      });
    }

    await OrderEventService.emitOrderCancelled(
      cancelledOrder.id,
      cancelledOrder.categoryId,
      cancelledOrder.governmentId,
      {
        actorId: customerId,
        actorRole: "customer",
        reason: cancelledOrder.cancellationReason || "customer_cancelled_order",
      },
    );

    return {
      success: true,
      message:
        flowType === "cancel_active_session_and_order"
          ? "Order cancelled and active session cancelled successfully"
          : flowType === "scheduled_cancel"
          ? "Scheduled order cancelled successfully"
          : "Order cancelled successfully",
      data: {
        orderId: cancelledOrder.id,
        orderStatus: cancelledOrder.status,
        sessionId: activeSession?.id || null,
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
        count: { ordersWithOffers: 0, availableOrders: 0, total: 0 },
      };
    }

    const activeSession = await prisma.jobSession.findFirst({
      where: {
        supplierId,
        status: { notIn: [SessionStatus.completed, SessionStatus.cancelled] },
      },
    });

    if (activeSession && activeSession.orderId) {
      const activeOrder = await buildSupplierOrderPayload(activeSession.orderId);
      if (!activeOrder) throw new AppError("Active order not found", 404);

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
      prisma.offer.findMany({
        where: { supplierId, status: OfferStatus.pending },
        select: { orderId: true },
      }),
    ]);

    const orderIdsWithOffers = new Set(supplierPendingOffers.map((o) => o.orderId));

    const payloads = await Promise.all(
      allPendingOrders.map((order) => buildSupplierOrderPayload(order.id)),
    );
    const validPayloads = payloads.filter(Boolean);

    const ordersWithOffers: any[] = [];
    const availableOrders: any[] = [];

    for (const payload of validPayloads) {
      if (!payload) continue;
      if (orderIdsWithOffers.has((payload as any).id)) {
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
    if (!order) throw new AppError("Order not found", 404);

    if (input.role === "customer") {
      if (order.customerId !== input.userId) throw new AppError("Not allowed", 403);
    }

    if (input.role === "supplier") {
      const supplierGovernmentIds = new Set(input.governmentIds || []);
      if (
        order.categoryId !== input.categoryId ||
        !supplierGovernmentIds.has(order.governmentId) ||
        order.customerId === input.userId
      ) {
        throw new AppError("Not allowed", 403);
      }
    }

    return { success: true, data: order };
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
      data: orders,
      meta: {
        page,
        limit,
        total,
        count: orders.length,
        hasNextPage: page * limit < total,
      },
    };
  }

  static async getScheduledOrders(input: {
    userId: string;
    role: string;
    page?: number;
    limit?: number;
    from?: string;
    to?: string;
  }) {
    const { userId, role, page = 1, limit = 20, from, to } = input;

    if (role !== "customer" && role !== "supplier") {
      throw new AppError("Not allowed", 403);
    }

    const fromDate = from ? new Date(from) : null;
    const toDate = to ? new Date(to) : null;
    if (fromDate && isNaN(fromDate.getTime())) throw new AppError("Invalid 'from' date", 400);
    if (toDate && isNaN(toDate.getTime())) throw new AppError("Invalid 'to' date", 400);

    const [orders, total] = await Promise.all([
      OrderRepository.findScheduledOrdersForUser({
        userId,
        role: role as "customer" | "supplier",
        from: fromDate,
        to: toDate,
        page,
        limit,
      }),
      OrderRepository.countScheduledOrdersForUser({
        userId,
        role: role as "customer" | "supplier",
        from: fromDate,
        to: toDate,
      }),
    ]);

    const orderIds = orders.map((o) => o.id);
    const acceptedOffers = orderIds.length
      ? await prisma.offer.findMany({
          where: { orderId: { in: orderIds }, status: OfferStatus.accepted },
        })
      : [];
    const offerByOrderId = new Map<string, any>();
    for (const off of acceptedOffers) offerByOrderId.set(off.orderId, off);

    const data = orders.map((o) => ({
      ...o,
      offer: offerByOrderId.get(o.id) || null,
    }));

    return {
      success: true,
      data,
      meta: {
        page,
        limit,
        total,
        count: data.length,
        hasNextPage: page * limit < total,
      },
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
      const session = await prisma.jobSession.findFirst({
        where: { orderId: pendingReviewOrder.id },
      });

      let supplierData = null;
      if (session?.supplierId) {
        supplierData = await prisma.user.findUnique({
          where: { id: session.supplierId },
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            phoneNumber: true,
            profilePicture: true,
            averageRating: true,
            totalReviews: true,
          },
        });
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

  static async getTimeline(input: {
    userId: string;
    role: string;
    page?: number;
    limit?: number;
    sort?: "recent" | "oldest";
  }) {
    const { userId, page = 1, limit = 20, sort = "recent" } = input;
    const skip = (page - 1) * limit;

    const [orders, ordersTotal, bookings, bookingsTotal] = await Promise.all([
      OrderRepository.findCustomerTimeline(userId, 1, 999),
      OrderRepository.countCustomerTimeline(userId),
      prisma.bundleBooking.findMany({ where: { customerId: userId } }),
      prisma.bundleBooking.count({ where: { customerId: userId } }),
    ]);

    const userSelect = {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      phoneNumber: true,
      profilePicture: true,
      address: true,
      averageRating: true,
      totalReviews: true,
    } as const;

    const enrichedOrders = await Promise.all(
      orders.map(async (order) => {
        const [offer, session, category, government, reviews] = await Promise.all([
          prisma.offer.findFirst({
            where: {
              orderId: order.id,
              status: {
                in: [
                  OfferStatus.accepted,
                  OfferStatus.completed,
                  OfferStatus.withdrawn,
                  OfferStatus.rejected,
                ],
              },
            },
            orderBy: { updatedAt: "desc" },
          }),
          prisma.jobSession.findFirst({
            where: { orderId: order.id },
            orderBy: { createdAt: "desc" },
          }),
          prisma.category.findUnique({
            where: { id: order.categoryId },
            select: { name: true },
          }),
          prisma.government.findUnique({
            where: { id: order.governmentId },
            select: { name: true, nameAr: true },
          }),
          prisma.review.findMany({ where: { orderId: order.id } }),
        ]);

        const [supplier, customer] = await Promise.all([
          offer?.supplierId
            ? prisma.user.findUnique({
                where: { id: offer.supplierId },
                select: userSelect,
              })
            : null,
          prisma.user.findUnique({
            where: { id: order.customerId },
            select: userSelect,
          }),
        ]);

        return {
          type: "order" as const,
          ...order,
          category: category || null,
          government: government || null,
          customer: customer || null,
          offer: offer ? { ...offer, supplier: supplier || null } : null,
          session: session || null,
          reviews: reviews || [],
        };
      }),
    );

    const enrichedBookings = await Promise.all(
      bookings.map(async (booking) => {
        const [bundle, supplier, customer, session, category, government, reviews] =
          await Promise.all([
            prisma.bundle.findUnique({ where: { id: booking.bundleId } }),
            prisma.user.findUnique({
              where: { id: booking.supplierId },
              select: userSelect,
            }),
            prisma.user.findUnique({
              where: { id: booking.customerId },
              select: userSelect,
            }),
            prisma.jobSession.findFirst({ where: { bundleBookingId: booking.id } }),
            prisma.category.findUnique({
              where: { id: booking.categoryId },
              select: { name: true },
            }),
            prisma.government.findUnique({
              where: { id: booking.governmentId },
              select: { name: true, nameAr: true },
            }),
            prisma.review.findMany({ where: { orderId: booking.id } }),
          ]);

        return {
          type: "bundle_booking" as const,
          ...booking,
          category: category || null,
          government: government || null,
          customer: customer || null,
          bundle: bundle || null,
          supplier: supplier || null,
          session: session || null,
          reviews: reviews || [],
        };
      }),
    );

    const getTimelineDate = (item: any) => {
      return new Date(
        item?.cancelledAt ||
          item?.completedAt ||
          item?.session?.cancelledAt ||
          item?.session?.completedAt ||
          item?.offer?.acceptedAt ||
          item?.offer?.rejectedAt ||
          item?.offer?.withdrawnAt ||
          item?.scheduledAt ||
          item?.updatedAt ||
          item?.createdAt ||
          0,
      ).getTime();
    };

    const merged = [...enrichedOrders, ...enrichedBookings].sort((a, b) => {
      const dateA = getTimelineDate(a);
      const dateB = getTimelineDate(b);
      return sort === "recent" ? dateB - dateA : dateA - dateB;
    });

    const total = ordersTotal + bookingsTotal;
    const paginated = merged.slice(skip, skip + limit);

    return {
      success: true,
      data: paginated,
      meta: {
        page,
        limit,
        total,
        count: paginated.length,
        hasNextPage: page * limit < total,
      },
    };
  }
}
