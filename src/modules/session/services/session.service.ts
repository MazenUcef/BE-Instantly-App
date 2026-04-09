import mongoose from "mongoose";
import Order from "../../order/models/Order.model";
import Offer from "../../offer/models/Offer.model";
import UserModel from "../../auth/models/User.model";
import CategoryModel from "../../category/models/Category.model";
import { AppError } from "../../../shared/middlewares/errorHandler";
import { SessionRepository } from "../repositories/session.repository";
import { SessionEventService } from "./session-event.service";
import { OrderRepository } from "../../order/repositories/order.repository";
import { OfferRepository } from "../../offer/repository/offer.repository";
import { OrderEventService } from "../../order/services/order-event.service";
import { socketEvents } from "../../../shared/config/socket";
import {
  SESSION_STATUS,
  SESSION_CANCELLED_BY,
  SESSION_RESUME_ACTION,
} from "../../../shared/constants/session.constants";
import { ORDER_STATUS, ORDER_CANCELLED_BY } from "../../../shared/constants/order.constants";
import { OFFER_STATUS } from "../../../shared/constants/offer.constants";
import { assertValidSessionTransition, canCancelSession, canCompleteSession, canConfirmSessionPayment, isSessionTerminal } from "../helper/session-state";
import BundleBookingModel from "../../bundleBooking/models/bundleBooking.model";
import BundleModel from "../../bundle/models/bundle.model";

const populateSessionData = async (session: any) => {
  if (!session) return null;

  const sessionObj = session.toObject ? session.toObject() : session;

  const [customer, supplier] = await Promise.all([
    UserModel.findById(session.customerId)
      .select("-password -refreshToken -biometrics")
      .lean(),
    UserModel.findById(session.supplierId)
      .select("-password -refreshToken -biometrics")
      .lean(),
  ]);

  if (session.bundleBookingId) {
    const bundleBooking = await BundleBookingModel.findById(session.bundleBookingId)
      .populate("categoryId", "name icon")
      .populate("governmentId", "name nameAr")
      .lean();
    const bundle = bundleBooking ? await BundleModel.findById(bundleBooking.bundleId).lean() : null;

    return {
      ...sessionObj,
      bundleBooking: bundleBooking || null,
      bundle: bundle || null,
      order: null,
      offer: null,
      customer: customer || null,
      supplier: supplier || null,
    };
  }

  const [order, offer] = await Promise.all([
    session.orderId
      ? Order.findById(session.orderId)
          .populate("categoryId", "name icon")
          .populate("governmentId", "name nameAr")
          .lean()
      : null,
    session.offerId ? Offer.findById(session.offerId).lean() : null,
  ]);

  return {
    ...sessionObj,
    order: order || null,
    offer: offer || null,
    bundleBooking: null,
    bundle: null,
    customer: customer || null,
    supplier: supplier || null,
  };
};

export class SessionService {
  private static ensureParticipant(session: any, userId: string) {
    const isParticipant =
      session.customerId.toString() === userId ||
      session.supplierId.toString() === userId;

    if (!isParticipant) {
      throw new AppError("Not allowed", 403);
    }
  }

  private static ensureSupplier(session: any, userId: string) {
    if (session.supplierId.toString() !== userId) {
      throw new AppError("Only supplier can do this action", 403);
    }
  }

  private static async validateSessionCreationInput(
    input: {
      orderId: string;
      offerId: string;
      customerId: string;
      supplierId: string;
    },
    dbSession: any,
  ) {
    const [order, offer] = await Promise.all([
      Order.findById(input.orderId).session(dbSession),
      Offer.findById(input.offerId).session(dbSession),
    ]);

    if (!order) {
      throw new AppError("Order not found", 404);
    }

    if (!offer) {
      throw new AppError("Offer not found", 404);
    }

    if (String(order._id) !== String(offer.orderId)) {
      throw new AppError("Offer does not belong to this order", 400);
    }

    if (String(order.customerId) !== String(input.customerId)) {
      throw new AppError("Customer mismatch for order", 400);
    }

    if (String(offer.supplierId) !== String(input.supplierId)) {
      throw new AppError("Supplier mismatch for offer", 400);
    }

    if (order.status !== ORDER_STATUS.IN_PROGRESS) {
      throw new AppError("Order must be in progress before creating session", 409);
    }

    if (offer.status !== OFFER_STATUS.ACCEPTED) {
      throw new AppError("Offer must be accepted before creating session", 409);
    }

    const existingOrderSession = await SessionRepository.findByOrderId(
      input.orderId,
      dbSession,
    );

    if (existingOrderSession) {
      throw new AppError("Session already exists for this order", 409);
    }

    const existingOfferSession = await SessionRepository.findByOfferId(
      input.offerId,
      dbSession,
    );

    if (existingOfferSession) {
      throw new AppError("Session already exists for this offer", 409);
    }

    const category = await CategoryModel.findById(order.categoryId).session(dbSession);

    if (!category) {
      throw new AppError("Category not found", 404);
    }

    const workflow = category.workflows?.find(
      (w) => w.key === (order as any).selectedWorkflow,
    );

    if (!workflow) {
      throw new AppError("Workflow not found for this order's category", 400);
    }

    return { order, offer, workflowSteps: workflow.steps };
  }

  static async createSession(input: {
    orderId: string;
    offerId: string;
    customerId: string;
    supplierId: string;
  }) {
    const { orderId, offerId, customerId, supplierId } = input;

    const dbSession = await mongoose.startSession();
    let createdSession: any;

    try {
      await dbSession.withTransaction(async () => {
        const { workflowSteps } = await this.validateSessionCreationInput(
          { orderId, offerId, customerId, supplierId },
          dbSession,
        );

        const existingCustomerSession = await SessionRepository.findActiveByUser(
          customerId,
          dbSession,
        );

        if (
          existingCustomerSession &&
          existingCustomerSession.customerId.toString() === customerId
        ) {
          throw new AppError("Customer already has an active session", 400);
        }

        const existingSupplierSession = await SessionRepository.findActiveByUser(
          supplierId,
          dbSession,
        );

        if (
          existingSupplierSession &&
          existingSupplierSession.supplierId.toString() === supplierId
        ) {
          throw new AppError("Supplier already has an active session", 400);
        }

        createdSession = await SessionRepository.createSession(
          {
            orderId,
            offerId,
            customerId,
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
        throw new AppError("Session already exists or active session conflict occurred", 409);
      }
      throw error;
    } finally {
      await dbSession.endSession();
    }

    const populatedSession = await populateSessionData(createdSession);
    await SessionEventService.notifySessionCreated(populatedSession);

    return {
      success: true,
      message: "Session created successfully",
      data: populatedSession,
    };
  }

  static async getSessionById(input: {
    sessionId: string;
    userId: string;
  }) {
    const session = await SessionRepository.findById(input.sessionId);

    if (!session) {
      throw new AppError("Session not found", 404);
    }

    this.ensureParticipant(session, input.userId);

    const populatedSession = await populateSessionData(session);

    return {
      success: true,
      data: { session: populatedSession },
    };
  }

  static async getActiveSessionForUser(input: {
    requestedUserId: string;
    actorUserId: string;
  }) {
    if (input.requestedUserId !== input.actorUserId) {
      throw new AppError("Not allowed", 403);
    }

    const session = await SessionRepository.findActiveByUser(input.actorUserId);

    if (!session) {
      return {
        success: true,
        active: false,
      };
    }

    const populatedSession = await populateSessionData(session);

    return {
      success: true,
      active: true,
      data: { session: populatedSession },
    };
  }

  static async updateSessionStatus(input: {
    sessionId: string;
    actorUserId: string;
    nextStatus: string;
    reason?: string;
  }) {
    const { sessionId, actorUserId, nextStatus, reason } = input;

    const dbSession = await mongoose.startSession();
    let updatedSession: any;
    let cancelledBy: "customer" | "supplier" | null = null;
    let relatedOrder: any = null;

    try {
      await dbSession.withTransaction(async () => {
        const session = await SessionRepository.findById(sessionId, dbSession);

        if (!session) {
          throw new AppError("Session not found", 404);
        }

        this.ensureParticipant(session, actorUserId);

        if (nextStatus === SESSION_STATUS.COMPLETED) {
          throw new AppError(
            "Use the complete endpoint to finish a session",
            400,
          );
        }

        if (nextStatus === SESSION_STATUS.CANCELLED) {
          if (!canCancelSession(session.status as string)) {
            throw new AppError("Session cannot be cancelled now", 400);
          }

          const isCustomer = session.customerId.toString() === actorUserId;
          cancelledBy = isCustomer
            ? SESSION_CANCELLED_BY.CUSTOMER
            : SESSION_CANCELLED_BY.SUPPLIER;

          updatedSession = await SessionRepository.markCancelled(
            sessionId,
            session.status,
            cancelledBy,
            reason,
            dbSession,
          );

          if (!updatedSession) {
            throw new AppError("Failed to cancel session", 409);
          }

          if (session.orderId && session.offerId) {
            // Order-based session cancellation
            relatedOrder = await Order.findById(session.orderId).session(dbSession);

            if (!relatedOrder) {
              throw new AppError("Associated order not found", 404);
            }

            await Offer.findByIdAndUpdate(
              session.offerId,
              {
                $set: isCustomer
                  ? { status: OFFER_STATUS.REJECTED, rejectedAt: new Date() }
                  : { status: OFFER_STATUS.WITHDRAWN, withdrawnAt: new Date() },
              },
              { session: dbSession, new: true },
            );

            if (isCustomer) {
              await Offer.updateMany(
                {
                  orderId: relatedOrder._id,
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

              await OrderRepository.markCancelled(
                {
                  orderId: relatedOrder._id,
                  cancelledBy: ORDER_CANCELLED_BY.CUSTOMER,
                  cancellationReason: reason || "customer_cancelled_session",
                },
                dbSession,
              );
            } else {
              await OrderRepository.resetToPending(relatedOrder._id, dbSession);
            }
          } else if (session.bundleBookingId) {
            // Bundle booking session cancellation
            await BundleBookingModel.findByIdAndUpdate(
              session.bundleBookingId,
              {
                $set: {
                  status: "cancelled",
                  cancelledBy: isCustomer ? "customer" : "supplier",
                },
              },
              { session: dbSession },
            );
          }

          return;
        }

        this.ensureSupplier(session, actorUserId);
        assertValidSessionTransition(session.workflowSteps, session.status, nextStatus);

        const extraSet = { [`stepTimestamps.${nextStatus}`]: new Date() };

        updatedSession = await SessionRepository.updateStatus(
          sessionId,
          session.status,
          nextStatus,
          extraSet,
          dbSession,
        );

        if (!updatedSession) {
          throw new AppError("Failed to update session status", 409);
        }
      });
    } finally {
      await dbSession.endSession();
    }

    const populatedSession = await populateSessionData(updatedSession);

    if (nextStatus !== SESSION_STATUS.CANCELLED) {
      SessionEventService.emitSessionToParticipants(
        socketEvents.SESSION_STATUS_UPDATED,
        populatedSession,
        { status: nextStatus },
      );

      await SessionEventService.notifySessionStatusUpdated(
        populatedSession,
        nextStatus,
      );

      return {
        success: true,
        message: `Session status updated to "${nextStatus}"`,
        data: { session: populatedSession },
      };
    }

    // Emit cancellation events using standard envelopes
    if (cancelledBy === SESSION_CANCELLED_BY.CUSTOMER && relatedOrder) {
      await OrderEventService.emitOrderCancelled(
        relatedOrder._id.toString(),
        relatedOrder.categoryId.toString(),
        relatedOrder.governmentId.toString(),
        {
          actorId: actorUserId,
          actorRole: "customer",
          reason: reason || "customer_cancelled_session",
        },
      );
    }

    if (cancelledBy === SESSION_CANCELLED_BY.SUPPLIER && relatedOrder) {
      await OrderEventService.emitOrderAvailableAgain(
        relatedOrder._id.toString(),
        relatedOrder.categoryId.toString(),
        relatedOrder.governmentId.toString(),
        reason || "supplier_cancelled_session",
      );
    }

    SessionEventService.emitSessionCancelled(populatedSession, {
      actorRole: cancelledBy!,
      actorId: actorUserId,
      reason,
    });

    await SessionEventService.notifySessionCancelled(
      populatedSession,
      cancelledBy!,
    );

    return {
      success: true,
      message:
        cancelledBy === SESSION_CANCELLED_BY.CUSTOMER
          ? "Session cancelled and order cancelled"
          : "Session cancelled and order returned to pending",
      data: {
        session: populatedSession,
        orderStatus:
          cancelledBy === SESSION_CANCELLED_BY.SUPPLIER
            ? ORDER_STATUS.PENDING
            : ORDER_STATUS.CANCELLED,
        cancelledBy,
      },
    };
  }

  static async completeSession(input: {
    sessionId: string;
    actorUserId: string;
  }) {
    const { sessionId, actorUserId } = input;

    const dbSession = await mongoose.startSession();
    let completedSession: any;

    try {
      await dbSession.withTransaction(async () => {
        const session = await SessionRepository.findById(sessionId, dbSession);

        if (!session) {
          throw new AppError("Session not found", 404);
        }

        this.ensureSupplier(session, actorUserId);

        if (isSessionTerminal(session.status)) {
          throw new AppError(
            `Session is already ${session.status}`,
            400,
          );
        }

        if (!canCompleteSession(session)) {
          throw new AppError(
            "Session cannot be completed from its current step",
            400,
          );
        }

        const lastWorkflowStep =
          session.workflowSteps[session.workflowSteps.length - 1] ??
          SESSION_STATUS.STARTED;

        completedSession = await SessionRepository.markCompleted(
          sessionId,
          lastWorkflowStep,
          dbSession,
        );

        if (!completedSession) {
          throw new AppError("Failed to complete session", 409);
        }

        if (session.orderId && session.offerId) {
          const [completedOrder, completedOffer] = await Promise.all([
            OrderRepository.markCompleted(session.orderId, dbSession),
            OfferRepository.markCompleted(session.offerId, dbSession),
          ]);

          if (!completedOrder) {
            throw new AppError("Failed to complete order", 409);
          }

          if (!completedOffer) {
            throw new AppError("Failed to complete offer", 409);
          }
        } else if (session.bundleBookingId) {
          const BundleBookingModel = (await import("../../bundleBooking/models/bundleBooking.model")).default;
          await BundleBookingModel.findByIdAndUpdate(
            session.bundleBookingId,
            { $set: { status: "completed", paymentConfirmed: true, paymentConfirmedAt: new Date() } },
            { session: dbSession },
          );
        }
      });
    } finally {
      await dbSession.endSession();
    }

    const populatedSession = await populateSessionData(completedSession);

    SessionEventService.emitSessionToParticipants(
      socketEvents.SESSION_COMPLETED,
      populatedSession,
    );

    await SessionEventService.notifySessionCompleted(populatedSession);

    return {
      success: true,
      message: "Session completed successfully",
      data: { session: populatedSession },
    };
  }

  static async getSessionByOrder(input: {
    orderId: string;
    userId: string;
  }) {
    const session = await SessionRepository.findByOrderId(input.orderId);

    if (!session) {
      throw new AppError("Session not found", 404);
    }

    this.ensureParticipant(session, input.userId);

    const populatedSession = await populateSessionData(session);

    return {
      success: true,
      data: { session: populatedSession },
    };
  }

  static async getSessionByBundleBooking(input: {
    bundleBookingId: string;
    userId: string;
  }) {
    const session = await SessionRepository.findByBundleBookingId(input.bundleBookingId);

    if (!session) {
      throw new AppError("Session not found for this booking", 404);
    }

    this.ensureParticipant(session, input.userId);

    const populatedSession = await populateSessionData(session);

    return {
      success: true,
      data: { session: populatedSession },
    };
  }

  static async confirmSessionPayment(input: {
    sessionId: string;
    userId: string;
    userRole: string;
  }) {
    const { sessionId, userId, userRole } = input;

    if (userRole !== "supplier") {
      throw new AppError("Only supplier can confirm payment", 403);
    }

    const dbSession = await mongoose.startSession();
    let updatedSession: any;

    try {
      await dbSession.withTransaction(async () => {
        const session = await SessionRepository.findById(sessionId, dbSession);

        if (!session) {
          throw new AppError("Session not found", 404);
        }

        if (session.supplierId.toString() !== userId) {
          throw new AppError(
            "Not allowed to confirm payment for this session",
            403,
          );
        }

        if (!canConfirmSessionPayment(session.status)) {
          throw new AppError(
            "Payment can only be confirmed after session completion",
            400,
          );
        }

        updatedSession = await SessionRepository.confirmPayment(
          sessionId,
          dbSession,
        );

        if (!updatedSession) {
          throw new AppError("Payment already confirmed", 409);
        }
      });
    } finally {
      await dbSession.endSession();
    }

    const populatedSession = await populateSessionData(updatedSession);

    SessionEventService.emitSessionToParticipants(
      socketEvents.SESSION_PAYMENT_CONFIRMED,
      populatedSession,
    );

    await SessionEventService.notifyPaymentConfirmed(populatedSession);

    return {
      success: true,
      message: "Payment confirmed successfully",
      data: { session: populatedSession },
    };
  }

  static async getResumeSessionForUser(input: {
    requestedUserId: string;
    actorUserId: string;
  }) {
    if (input.requestedUserId !== input.actorUserId) {
      throw new AppError("Not allowed", 403);
    }

    const session = await SessionRepository.findLatestByUser(input.actorUserId);

    if (!session) {
      return {
        success: true,
        hasAction: false,
        action: SESSION_RESUME_ACTION.NONE,
        session: null,
      };
    }

    const populatedSession = await populateSessionData(session);

    const isCustomer = String(session.customerId) === String(input.actorUserId);
    const isSupplier = String(session.supplierId) === String(input.actorUserId);

    if (
      ![SESSION_STATUS.COMPLETED, SESSION_STATUS.CANCELLED].includes(
        session.status as any,
      )
    ) {
      return {
        success: true,
        hasAction: true,
        action: SESSION_RESUME_ACTION.JOB_SESSION,
        session: populatedSession,
      };
    }

    if (session.status === SESSION_STATUS.COMPLETED) {
      // Determine review status from either order or bundleBooking
      const reviewSource = populatedSession?.order || populatedSession?.bundleBooking;

      if (isCustomer && !reviewSource?.customerReviewed) {
        return {
          success: true,
          hasAction: true,
          action: SESSION_RESUME_ACTION.REVIEW,
          session: populatedSession,
        };
      }

      if (isSupplier && !session.paymentConfirmed) {
        return {
          success: true,
          hasAction: true,
          action: SESSION_RESUME_ACTION.PAYMENT_CONFIRMATION,
          session: populatedSession,
        };
      }

      if (isSupplier && session.paymentConfirmed && !reviewSource?.supplierReviewed) {
        return {
          success: true,
          hasAction: true,
          action: SESSION_RESUME_ACTION.REVIEW,
          session: populatedSession,
        };
      }
    }

    return {
      success: true,
      hasAction: false,
      action: SESSION_RESUME_ACTION.NONE,
      session: populatedSession,
    };
  }
}