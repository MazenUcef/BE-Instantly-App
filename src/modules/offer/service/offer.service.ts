import mongoose from "mongoose";
import UserModel from "../../auth/models/User.model";
import orderModel from "../../order/models/Order.model";
import sessionModel from "../../session/models/session.model";
import CategoryModel from "../../category/models/Category.model";
import { AppError } from "../../../shared/middlewares/errorHandler";
import { OfferEventService } from "./offer-event.service";
import { ORDER_STATUS } from "../../../shared/constants/order.constants";
import { OFFER_STATUS } from "../../../shared/constants/offer.constants";
import {
  getIO,
  socketEvents,
  socketRooms,
} from "../../../shared/config/socket";
import { buildSupplierOrderPayload } from "../../../shared/utils/buildSupplierOrderPayload";
import { OfferRepository } from "../repository/offer.repository";
import { OrderRepository } from "../../order/repositories/order.repository";
import { OrderEventService } from "../../order/services/order-event.service";
import { SessionRepository } from "../../session/repositories/session.repository";
import { SessionEventService } from "../../session/services/session-event.service";
import { SESSION_STATUS, SESSION_CANCELLED_BY } from "../../../shared/constants/session.constants";

async function resolveWorkflowSteps(order: any, dbSession: any): Promise<string[]> {
  const category = await CategoryModel.findById(order.categoryId).session(dbSession || null);
  if (!category) throw new AppError("Category not found", 404);
  const workflow = category.workflows?.find((w) => w.key === order.selectedWorkflow);
  if (!workflow) throw new AppError("Workflow not found for this order's category", 400);
  return workflow.steps;
}

export class OfferService {
  private static async ensureSupplierCanCreateOffer(
    supplierId: string,
    dbSession?: any,
  ) {
    const [reviewRequiredOrder, activeAcceptedOffer] = await Promise.all([
      orderModel.findOne({
        supplierId,
        status: ORDER_STATUS.COMPLETED,
        supplierReviewed: false,
      })
        .sort({ updatedAt: -1 })
        .session(dbSession || null),
      OfferRepository.findAcceptedOfferBySupplier(supplierId, dbSession),
    ]);

    if (reviewRequiredOrder) {
      const session = await sessionModel
        .findOne({
          orderId: reviewRequiredOrder._id,
        })
        .session(dbSession || null);

      let customer = null;
      if (session?.customerId) {
        customer = await UserModel.findById(session.customerId).select(
          "-password -refreshToken -biometrics",
        );
      }

      const error = new AppError(
        "You must review your last completed job before creating a new offer.",
        403,
      );
      (error as any).reviewRequired = true;
      (error as any).order = {
        ...reviewRequiredOrder.toObject(),
        customer,
      };
      throw error;
    }

    if (activeAcceptedOffer) {
      throw new AppError(
        "You already have an active job. Cannot create new offers.",
        400,
      );
    }
  }

  private static async validateOrderForOfferCreation(orderId: string) {
    const order = await orderModel.findById(orderId);

    if (!order) {
      throw new AppError("Order not found", 404);
    }

    if (order.status !== ORDER_STATUS.PENDING) {
      throw new AppError("Only pending orders can receive offers", 400);
    }

    return order;
  }

  static async createOffer(input: {
    supplierId: string;
    orderId: string;
    amount: number;
    timeRange?: string | null;
    timeToStart?: string | Date | null;
  }) {
    const { supplierId, orderId, amount, timeRange, timeToStart } = input;

    if (!amount || amount <= 0) {
      throw new AppError("Offer amount must be greater than 0", 400);
    }

    const dbSession = await mongoose.startSession();
    let order: any;
    let offer: any;
    let created = false;

    try {
      await dbSession.withTransaction(async () => {
        await this.ensureSupplierCanCreateOffer(supplierId, dbSession);

        order = await orderModel.findById(orderId).session(dbSession || null);
        if (!order) {
          throw new AppError("Order not found", 404);
        }

        if (order.status !== ORDER_STATUS.PENDING) {
          throw new AppError("Cannot create offer for this order now", 400);
        }

        if (order.customerId.toString() === supplierId) {
          throw new AppError(
            "You cannot create an offer on your own order",
            400,
          );
        }

        const existingOffer =
          await OfferRepository.findPendingOfferBySupplierAndOrder(
            supplierId,
            orderId,
            dbSession,
          );

        if (existingOffer) {
          offer = await OfferRepository.updatePendingOffer(
            existingOffer._id,
            {
              amount,
              timeRange,
              timeToStart,
              expiresAt: null,
            },
            dbSession,
          );
          created = false;
        } else {
          offer = await OfferRepository.createOffer(
            {
              orderId,
              supplierId,
              amount,
              timeRange,
              timeToStart,
              expiresAt: null,
              status: OFFER_STATUS.PENDING,
            },
            dbSession,
          );
          created = true;
        }
      });
    } catch (error: any) {
      if (error?.code === 11000) {
        throw new AppError(
          "A pending offer for this order already exists for this supplier.",
          409,
        );
      }
      throw error;
    } finally {
      await dbSession.endSession();
    }

    const payload = created
      ? await OfferEventService.emitOfferCreatedToCustomer({
          customerId: order.customerId.toString(),
          offer,
        })
      : await OfferEventService.emitOfferUpdatedToCustomer({
          customerId: order.customerId.toString(),
          offer,
        });

    const io = getIO();
    io.to(socketRooms.user(supplierId)).emit(
      created
        ? socketEvents.SUPPLIER_OFFER_CREATED
        : socketEvents.SUPPLIER_OFFER_UPDATED,
      {
        offer: payload,
        timestamp: new Date(),
      },
    );

    await Promise.all([
      OfferEventService.emitSupplierPendingCountUpdate(supplierId),
      OfferEventService.emitSupplierPendingOffersList(supplierId),
      OfferEventService.notifyCustomerNewOffer({
        customerId: order.customerId.toString(),
        orderId: order._id.toString(),
        offerId: offer._id.toString(),
        supplierId,
        amount,
        timeRange,
        timeToStart,
      }),
    ]);

    return {
      success: true,
      created,
      message: created
        ? "Offer created successfully"
        : "Offer updated successfully",
      offer: payload,
    };
  }

  static async acceptOffer(input: { offerId: string; customerId: string }) {
    const { offerId, customerId } = input;

    const dbSession = await mongoose.startSession();
    let offer: any;
    let order: any;
    let sessionDoc: any;
    let supplierOtherPendingOffers: any[] = [];
    let rejectedOrderOffers: any[] = [];

    try {
      await dbSession.withTransaction(async () => {
        const existingOffer = await OfferRepository.findById(
          offerId,
          dbSession,
        );

        if (!existingOffer) {
          throw new AppError("Offer not found", 404);
        }

        if (existingOffer.status !== OFFER_STATUS.PENDING) {
          throw new AppError("Offer not found or already processed", 409);
        }

        order = await orderModel.findById(existingOffer.orderId).session(
          dbSession || null,
        );

        if (!order) {
          throw new AppError("Associated order not found", 404);
        }

        if (order.customerId.toString() !== customerId) {
          throw new AppError("Not allowed", 403);
        }

        if (order.status !== ORDER_STATUS.PENDING) {
          throw new AppError(
            "Order is not available for offer acceptance",
            409,
          );
        }

        offer = await OfferRepository.acceptPendingOffer(offerId, dbSession);
        if (!offer) {
          throw new AppError("Offer not found or already processed", 409);
        }

        supplierOtherPendingOffers =
          await OfferRepository.findSupplierOtherPendingOffers(
            offer.supplierId,
            offer._id,
            dbSession,
          );

        rejectedOrderOffers = await OfferRepository.findPendingOffersByOrder(
          order._id,
          dbSession,
        );

        await OfferRepository.rejectOtherPendingOffersForSupplier(
          offer.supplierId,
          offer._id,
          dbSession,
        );

        await OfferRepository.rejectOtherOffersForOrder(
          order._id,
          offer._id,
          dbSession,
        );

        const updatedOrder = await OrderRepository.markInProgress(
          order._id,
          offer.supplierId,
          offer.amount,
          dbSession,
        );

        if (!updatedOrder) {
          throw new AppError("Order state changed concurrently", 409);
        }

        const workflowSteps = await resolveWorkflowSteps(order, dbSession);

        sessionDoc = await SessionRepository.createSession(
          {
            orderId: order._id,
            offerId: offer._id,
            customerId: order.customerId,
            supplierId: offer.supplierId,
            workflowSteps,
            status: SESSION_STATUS.STARTED,
            startedAt: new Date(),
          },
          dbSession,
        );
      });
    } catch (error: any) {
      if (error?.code === 11000) {
        throw new AppError(
          "This offer or supplier active job state changed. Please refresh and try again.",
          409,
        );
      }
      throw error;
    } finally {
      await dbSession.endSession();
    }

    const io = getIO();

    const orderPayload = await buildSupplierOrderPayload(order._id.toString());
    const sessionPayload = sessionDoc
      ? {
          _id: sessionDoc._id.toString(),
          orderId: sessionDoc.orderId.toString(),
          offerId: sessionDoc.offerId.toString(),
          customerId: sessionDoc.customerId.toString(),
          supplierId: sessionDoc.supplierId.toString(),
          status: sessionDoc.status,
        }
      : null;

    io.to(socketRooms.user(offer.supplierId.toString())).emit(
      socketEvents.OFFER_ACCEPTED,
      {
        offerId: offer._id.toString(),
        orderId: offer.orderId.toString(),
        supplierId: offer.supplierId.toString(),
        sessionId: sessionDoc?._id?.toString() || null,
        order: orderPayload,
        session: sessionPayload,
        timestamp: new Date(),
      },
    );

    io.to(socketRooms.user(order.customerId.toString())).emit(
      socketEvents.OFFER_ACCEPTED,
      {
        offerId: offer._id.toString(),
        orderId: offer.orderId.toString(),
        supplierId: offer.supplierId.toString(),
        sessionId: sessionDoc?._id?.toString() || null,
        order: orderPayload,
        session: sessionPayload,
        timestamp: new Date(),
      },
    );

    io.to(socketRooms.user(order.customerId.toString())).emit(
      socketEvents.SESSION_CREATED,
      {
        session: sessionPayload,
        order: orderPayload,
        offer: {
          _id: offer._id.toString(),
          orderId: offer.orderId.toString(),
          supplierId: offer.supplierId.toString(),
          amount: offer.amount,
          status: offer.status,
        },
        meta: {
          trigger: "offer_accepted",
          timestamp: new Date(),
        },
      },
    );

    io.to(socketRooms.user(offer.supplierId.toString())).emit(
      socketEvents.SESSION_CREATED,
      {
        session: sessionPayload,
        order: orderPayload,
        offer: {
          _id: offer._id.toString(),
          orderId: offer.orderId.toString(),
          supplierId: offer.supplierId.toString(),
          amount: offer.amount,
          status: offer.status,
        },
        meta: {
          trigger: "offer_accepted",
          timestamp: new Date(),
        },
      },
    );

    for (const pendingOffer of supplierOtherPendingOffers) {
      const pendingOrder = await orderModel.findById(pendingOffer.orderId);
      if (!pendingOrder) continue;

      io.to(socketRooms.user(pendingOrder.customerId.toString())).emit(
        socketEvents.OFFER_DELETED,
        {
          offerId: pendingOffer._id.toString(),
          orderId: pendingOffer.orderId.toString(),
          supplierId: offer.supplierId.toString(),
          message: "Supplier withdrew their offer as they accepted another job",
          acceptedOrderId: order._id.toString(),
          timestamp: new Date(),
        },
      );
    }

    await Promise.all([
      OfferEventService.emitSupplierPendingCountUpdate(
        offer.supplierId.toString(),
      ),
      OfferEventService.emitSupplierPendingOffersList(
        offer.supplierId.toString(),
      ),
      OfferEventService.notifySupplierOfferAccepted({
        supplierId: offer.supplierId.toString(),
        orderId: order._id.toString(),
        offerId: offer._id.toString(),
        sessionId: sessionDoc?._id?.toString() || null,
        withdrawnOrderIds: supplierOtherPendingOffers.map((o) =>
          o.orderId.toString(),
        ),
      }),
      sessionDoc
        ? SessionEventService.notifySessionCreated(sessionDoc)
        : Promise.resolve(),
    ]);

    return {
      success: true,
      message: "Offer accepted successfully",
      offer: {
        _id: offer._id.toString(),
        orderId: offer.orderId.toString(),
        supplierId: offer.supplierId.toString(),
        amount: offer.amount,
        status: offer.status,
      },
      session: sessionPayload,
      order: orderPayload,
      withdrawnOffers: {
        count: supplierOtherPendingOffers.length,
        orders: supplierOtherPendingOffers.map((o) => o.orderId.toString()),
      },
    };
  }

  static async rejectOffer(input: { offerId: string; customerId: string }) {
    const { offerId, customerId } = input;

    const dbSession = await mongoose.startSession();
    let rejectedOffer: any;
    let order: any;

    try {
      await dbSession.withTransaction(async () => {
        const offer = await OfferRepository.findById(offerId, dbSession);
        if (!offer) {
          throw new AppError("Offer not found", 404);
        }

        order = await orderModel.findById(offer.orderId).session(dbSession);
        if (!order) {
          throw new AppError("Associated order not found", 404);
        }

        if (order.customerId.toString() !== customerId) {
          throw new AppError("Not allowed", 403);
        }

        if (order.status !== ORDER_STATUS.PENDING) {
          throw new AppError("Cannot reject offer for this order now", 400);
        }

        rejectedOffer = await OfferRepository.rejectPendingOffer(offerId, dbSession);
        if (!rejectedOffer) {
          throw new AppError("Offer not found or already processed", 409);
        }
      });
    } finally {
      await dbSession.endSession();
    }

    const io = getIO();

    io.to(socketRooms.user(rejectedOffer.supplierId.toString())).emit(
      socketEvents.OFFER_REJECTED,
      {
        offerId: rejectedOffer._id.toString(),
        orderId: rejectedOffer.orderId.toString(),
        reason: "customer_rejected",
        timestamp: new Date(),
      },
    );

    await Promise.all([
      OfferEventService.emitSupplierPendingCountUpdate(
        rejectedOffer.supplierId.toString(),
      ),
      OfferEventService.emitSupplierPendingOffersList(
        rejectedOffer.supplierId.toString(),
      ),
      OfferEventService.emitOrderAvailableAgain(
        rejectedOffer.orderId.toString(),
      ),
      OfferEventService.notifySupplierOfferRejected({
        supplierId: rejectedOffer.supplierId.toString(),
        offerId: rejectedOffer._id.toString(),
        orderId: rejectedOffer.orderId.toString(),
      }),
    ]);

    return {
      success: true,
      message: "Offer rejected successfully",
      offer: rejectedOffer,
    };
  }

  static async deleteOffer(input: { offerId: string; supplierId: string }) {
    const { offerId, supplierId } = input;

    const dbSession = await mongoose.startSession();

    let deletedOffer: any = null;
    let relatedOrder: any = null;
    let relatedSession: any = null;
    let flowType: "pending_withdraw" | "accepted_cancel" | null = null;

    try {
      await dbSession.withTransaction(async () => {
        const existingOffer = await OfferRepository.findById(
          offerId,
          dbSession,
        );

        if (!existingOffer) {
          throw new AppError("Offer not found", 404);
        }

        if (existingOffer.supplierId.toString() !== supplierId) {
          throw new AppError("Not allowed", 403);
        }

        if (
          ![OFFER_STATUS.PENDING, OFFER_STATUS.ACCEPTED].includes(
            existingOffer.status as any,
          )
        ) {
          throw new AppError(
            "Only pending or accepted offers can be withdrawn by supplier",
            400,
          );
        }

        relatedOrder = await orderModel.findById(existingOffer.orderId).session(
          dbSession || null,
        );

        if (!relatedOrder) {
          throw new AppError("Associated order not found", 404);
        }

        if (existingOffer.status === OFFER_STATUS.PENDING) {
          deletedOffer = await OfferRepository.withdrawPendingOfferBySupplier(
            offerId,
            supplierId,
            dbSession,
          );

          if (!deletedOffer) {
            throw new AppError(
              "Offer not found, not owned by supplier, or cannot be withdrawn",
              404,
            );
          }

          flowType = "pending_withdraw";
          return;
        }

        // accepted offer flow
        const activeRelatedSession = await sessionModel
          .findOne({
            offerId: existingOffer._id,
            status: {
              $nin: [SESSION_STATUS.COMPLETED, SESSION_STATUS.CANCELLED],
            },
          })
          .session(dbSession || null);

        if (activeRelatedSession) {
          const cancelled = await SessionRepository.markCancelled(
            activeRelatedSession._id,
            activeRelatedSession.status,
            SESSION_CANCELLED_BY.SUPPLIER,
            "supplier_deleted_accepted_offer",
            dbSession,
          );
          // Capture the updated session for post-transaction socket emissions
          relatedSession = cancelled || activeRelatedSession;
          relatedSession.status = SESSION_STATUS.CANCELLED;
          relatedSession.cancelledBy = SESSION_CANCELLED_BY.SUPPLIER;
          relatedSession.cancellationReason = "supplier_deleted_accepted_offer";
        }

        deletedOffer = await OfferRepository.withdrawAcceptedOfferBySupplier(
          offerId,
          supplierId,
          dbSession,
        );

        if (!deletedOffer) {
          throw new AppError("Accepted offer could not be withdrawn", 409);
        }

        const resetOrder = await OrderRepository.resetToPending(relatedOrder._id, dbSession);
        if (!resetOrder) {
          throw new AppError("Order state changed concurrently", 409);
        }

        flowType = "accepted_cancel";
      });
    } catch (error: any) {
      if (error?.code === 11000) {
        throw new AppError(
          "State changed while withdrawing the offer. Please refresh and try again.",
          409,
        );
      }
      throw error;
    } finally {
      await dbSession.endSession();
    }

    const io = getIO();

    if (flowType === "pending_withdraw") {
      io.to(socketRooms.user(relatedOrder.customerId.toString())).emit(
        socketEvents.OFFER_DELETED,
        {
          offerId: deletedOffer._id.toString(),
          orderId: deletedOffer.orderId.toString(),
          supplierId,
          message: "A supplier has withdrawn their offer",
          timestamp: new Date(),
        },
      );

      io.to(socketRooms.user(supplierId)).emit(
        socketEvents.SUPPLIER_OFFER_WITHDRAWN,
        {
          offerId: deletedOffer._id.toString(),
          orderId: deletedOffer.orderId.toString(),
          reason: "user_deleted",
          timestamp: new Date(),
        },
      );

      await Promise.all([
        OfferEventService.emitSupplierPendingCountUpdate(supplierId),
        OfferEventService.emitSupplierPendingOffersList(supplierId),
      ]);

      return {
        success: true,
        message: "Offer withdrawn successfully",
        data: {
          offerId: deletedOffer._id.toString(),
          orderId: deletedOffer.orderId.toString(),
        },
      };
    }

    if (relatedSession) {
      SessionEventService.emitSessionCancelled(relatedSession, {
        actorRole: SESSION_CANCELLED_BY.SUPPLIER,
        actorId: supplierId,
        reason: "supplier_deleted_accepted_offer",
      });
      await SessionEventService.notifySessionCancelled(
        relatedSession,
        SESSION_CANCELLED_BY.SUPPLIER,
      );
    }

    io.to(socketRooms.user(relatedOrder.customerId.toString())).emit(
      socketEvents.OFFER_DELETED,
      {
        offerId: deletedOffer._id.toString(),
        orderId: deletedOffer.orderId.toString(),
        supplierId,
        message: "The supplier cancelled the accepted offer",
        reason: "supplier_deleted_accepted_offer",
        timestamp: new Date(),
      },
    );

    io.to(socketRooms.user(supplierId)).emit(
      socketEvents.SUPPLIER_OFFER_WITHDRAWN,
      {
        offerId: deletedOffer._id.toString(),
        orderId: deletedOffer.orderId.toString(),
        reason: "supplier_deleted_accepted_offer",
        timestamp: new Date(),
      },
    );

    await Promise.all([
      OrderEventService.emitOrderAvailableAgain(
        relatedOrder._id.toString(),
        relatedOrder.categoryId.toString(),
        relatedOrder.governmentId.toString(),
        "supplier_deleted_accepted_offer",
      ),
      OfferEventService.emitSupplierPendingCountUpdate(supplierId),
      OfferEventService.emitSupplierPendingOffersList(supplierId),
    ]);

    return {
      success: true,
      message:
        "Accepted offer withdrawn, session cancelled, and order returned to pending",
      data: {
        offerId: deletedOffer._id.toString(),
        orderId: deletedOffer.orderId.toString(),
        sessionId: relatedSession?._id?.toString() || null,
        orderStatus: ORDER_STATUS.PENDING,
        sessionStatus: SESSION_STATUS.CANCELLED,
      },
    };
  }

  static async getOffersByOrder(input: {
    orderId: string;
    userId: string;
    role: string;
  }) {
    const { orderId, userId, role } = input;

    const order = await orderModel.findById(orderId);
    if (!order) {
      throw new AppError("Order not found", 404);
    }

    if (role === "customer" && order.customerId.toString() !== userId) {
      throw new AppError("Not allowed", 403);
    }

    if (role === "supplier" && order.customerId.toString() === userId) {
      throw new AppError("Not allowed", 403);
    }

    const offers = role === "supplier"
      ? await OfferRepository.findSupplierOfferForOrder(orderId, userId)
      : await OfferRepository.findOrderOffers(orderId);

    const enrichedOffers = await Promise.all(
      offers.map(async (offer: any) => {
        const supplier = await UserModel.findById(offer.supplierId).select(
          "-password -refreshToken -biometrics",
        );

        return {
          ...offer.toObject(),
          supplier: supplier || null,
        };
      }),
    );

    return {
      success: true,
      data: enrichedOffers,
    };
  }

  static async acceptOrderDirect(input: {
    orderId: string;
    supplierId: string;
  }) {
    const { orderId, supplierId } = input;

    const dbSession = await mongoose.startSession();
    let order: any;
    let offer: any;
    let sessionDoc: any;
    let supplierPendingOffers: any[] = [];

    try {
      await dbSession.withTransaction(async () => {
        await this.ensureSupplierCanCreateOffer(supplierId, dbSession);

        order = await orderModel.findById(orderId).session(dbSession || null);

        if (!order) {
          throw new AppError("Order not found", 404);
        }

        if (order.status !== ORDER_STATUS.PENDING) {
          throw new AppError("Order already taken or not available", 409);
        }

        if (order.customerId.toString() === supplierId) {
          throw new AppError("You cannot accept your own order", 400);
        }

        supplierPendingOffers =
          await OfferRepository.findPendingOffersBySupplier(
            supplierId,
            dbSession,
          );

        offer = await OfferRepository.createOffer(
          {
            orderId,
            supplierId,
            amount: order.requestedPrice,
            status: OFFER_STATUS.ACCEPTED,
          },
          dbSession,
        );

        await OfferRepository.rejectOtherPendingOffersForSupplier(
          supplierId,
          offer._id,
          dbSession,
        );

        await OfferRepository.rejectOtherOffersForOrder(
          orderId,
          offer._id,
          dbSession,
        );

        const updatedOrder = await OrderRepository.markInProgress(
          order._id,
          supplierId,
          order.requestedPrice,
          dbSession,
        );

        if (!updatedOrder) {
          throw new AppError("Order state changed concurrently", 409);
        }

        const workflowSteps = await resolveWorkflowSteps(order, dbSession);

        sessionDoc = await SessionRepository.createSession(
          {
            orderId: order._id,
            offerId: offer._id,
            customerId: order.customerId,
            supplierId,
            workflowSteps,
            status: SESSION_STATUS.STARTED,
            startedAt: new Date(),
          },
          dbSession,
        );
      });
    } catch (error: any) {
      if (error?.code === 11000) {
        throw new AppError(
          "Order or supplier active job state changed. Please refresh and try again.",
          409,
        );
      }
      throw error;
    } finally {
      await dbSession.endSession();
    }

    const io = getIO();
    const orderPayload = await buildSupplierOrderPayload(order._id.toString());
    const sessionPayload = {
      _id: sessionDoc._id.toString(),
      orderId: sessionDoc.orderId.toString(),
      offerId: sessionDoc.offerId.toString(),
      customerId: sessionDoc.customerId.toString(),
      supplierId: sessionDoc.supplierId.toString(),
      status: sessionDoc.status,
    };

    io.to(socketRooms.user(order.customerId.toString())).emit(
      socketEvents.ORDER_ACCEPTED_DIRECT,
      {
        orderId: order._id.toString(),
        supplierId: supplierId.toString(),
        offerId: offer._id.toString(),
        sessionId: sessionDoc._id.toString(),
        order: orderPayload,
        session: sessionPayload,
        withdrawnOffersCount: supplierPendingOffers.length,
        timestamp: new Date(),
      },
    );

    io.to(socketRooms.user(supplierId.toString())).emit(
      socketEvents.ORDER_ACCEPTED_DIRECT,
      {
        orderId: order._id.toString(),
        supplierId: supplierId.toString(),
        offerId: offer._id.toString(),
        sessionId: sessionDoc._id.toString(),
        order: orderPayload,
        session: sessionPayload,
        withdrawnOffersCount: supplierPendingOffers.length,
        timestamp: new Date(),
      },
    );

    io.to(socketRooms.user(order.customerId.toString())).emit(
      socketEvents.SESSION_CREATED,
      {
        session: sessionPayload,
        order: orderPayload,
        offer: {
          _id: offer._id.toString(),
          orderId: offer.orderId.toString(),
          supplierId: offer.supplierId.toString(),
          amount: offer.amount,
          status: offer.status,
        },
        meta: {
          trigger: "order_accepted_direct",
          timestamp: new Date(),
        },
      },
    );

    await Promise.all([
      OfferEventService.emitSupplierPendingCountUpdate(supplierId),
      OfferEventService.emitSupplierPendingOffersList(supplierId),
      SessionEventService.notifySessionCreated(sessionDoc),
    ]);

    return {
      success: true,
      message: "Order accepted successfully",
      offer: {
        _id: offer._id.toString(),
        orderId: offer.orderId.toString(),
        supplierId: offer.supplierId.toString(),
        amount: offer.amount,
        status: offer.status,
      },
      session: sessionPayload,
      order: orderPayload,
      withdrawnOffers: {
        count: supplierPendingOffers.length,
        orders: supplierPendingOffers.map((o) => o.orderId.toString()),
      },
    };
  }

  static async getAcceptedOfferHistory(input: {
    supplierId: string;
    page?: number;
    limit?: number;
  }) {
    const { supplierId, page = 1, limit = 20 } = input;

    const [offers, total] = await Promise.all([
      OfferRepository.findSupplierAcceptedOffersHistory(
        supplierId,
        page,
        limit,
      ),
      OfferRepository.countSupplierAcceptedOffersHistory(supplierId),
    ]);

    const enrichedOffers = await Promise.all(
      offers.map(async (offer: any) => {
        const [order, session] = await Promise.all([
          orderModel.findById(offer.orderId),
          sessionModel.findOne({ offerId: offer._id }),
        ]);

        return {
          ...offer.toObject(),
          order: order || null,
          session: session || null,
        };
      }),
    );

    return {
      success: true,
      data: enrichedOffers,
      meta: {
        page,
        limit,
        total,
        count: enrichedOffers.length,
        hasNextPage: page * limit < total,
      },
    };
  }

  static async getSupplierPendingOffers(input: {
    supplierId: string;
    page?: number;
    limit?: number;
  }) {
    const { supplierId, page = 1, limit = 20 } = input;

    const [offers, total, activeAcceptedOffer] = await Promise.all([
      OfferRepository.findSupplierPendingOffersPaginated(
        supplierId,
        page,
        limit,
      ),
      OfferRepository.countPendingOffersBySupplier(supplierId),
      OfferRepository.findAcceptedOfferBySupplier(supplierId),
    ]);

    const enrichedOffers = await Promise.all(
      offers.map(async (offer: any) => {
        const order = await orderModel.findById(offer.orderId).lean();

        return {
          ...offer.toObject(),
          order: order || null,
        };
      }),
    );

    return {
      success: true,
      data: enrichedOffers,
      meta: {
        page,
        limit,
        total,
        count: enrichedOffers.length,
        hasNextPage: page * limit < total,
      },
      stats: {
        totalPending: total,
        hasActiveJob: !!activeAcceptedOffer,
      },
    };
  }
}
