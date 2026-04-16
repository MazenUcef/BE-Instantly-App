import prisma from "../../../shared/config/prisma";
import {
  Prisma,
  OrderStatus,
  OfferStatus,
  SessionStatus,
  BundleBookingStatus,
} from "@prisma/client";
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
import {
  ORDER_STATUS,
  ORDER_CANCELLED_BY,
} from "../../../shared/constants/order.constants";
import {
  assertValidSessionTransition,
  canCancelSession,
  canCompleteSession,
  canConfirmSessionPayment,
  isSessionTerminal,
} from "../helper/session-state";

type Tx = Prisma.TransactionClient;

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
  role: true,
} as const;

const populateSessionData = async (session: any) => {
  if (!session) return null;

  const [customer, supplier] = await Promise.all([
    prisma.user.findUnique({ where: { id: session.customerId }, select: userSelect }),
    prisma.user.findUnique({ where: { id: session.supplierId }, select: userSelect }),
  ]);

  if (session.bundleBookingId) {
    const bundleBooking = await prisma.bundleBooking.findUnique({
      where: { id: session.bundleBookingId },
      include: {
        category: { select: { id: true, name: true } },
        government: { select: { id: true, name: true, nameAr: true } },
      },
    });
    const bundle = bundleBooking
      ? await prisma.bundle.findUnique({ where: { id: bundleBooking.bundleId } })
      : null;

    return {
      ...session,
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
      ? prisma.order.findUnique({
          where: { id: session.orderId },
          include: {
            category: { select: { id: true, name: true } },
            government: { select: { id: true, name: true, nameAr: true } },
          },
        })
      : null,
    session.offerId ? prisma.offer.findUnique({ where: { id: session.offerId } }) : null,
  ]);

  return {
    ...session,
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
      session.customerId === userId || session.supplierId === userId;
    if (!isParticipant) throw new AppError("Not allowed", 403);
  }

  private static ensureSupplier(session: any, userId: string) {
    if (session.supplierId !== userId) {
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
    tx: Tx,
  ) {
    const [order, offer] = await Promise.all([
      tx.order.findUnique({ where: { id: input.orderId } }),
      tx.offer.findUnique({ where: { id: input.offerId } }),
    ]);

    if (!order) throw new AppError("Order not found", 404);
    if (!offer) throw new AppError("Offer not found", 404);
    if (order.id !== offer.orderId)
      throw new AppError("Offer does not belong to this order", 400);
    if (order.customerId !== input.customerId)
      throw new AppError("Customer mismatch for order", 400);
    if (offer.supplierId !== input.supplierId)
      throw new AppError("Supplier mismatch for offer", 400);
    if (order.status !== OrderStatus.in_progress)
      throw new AppError("Order must be in progress before creating session", 409);
    if (offer.status !== OfferStatus.accepted)
      throw new AppError("Offer must be accepted before creating session", 409);

    const existingOrderSession = await SessionRepository.findByOrderId(input.orderId, tx);
    if (existingOrderSession)
      throw new AppError("Session already exists for this order", 409);

    const existingOfferSession = await SessionRepository.findByOfferId(input.offerId, tx);
    if (existingOfferSession)
      throw new AppError("Session already exists for this offer", 409);

    const category = await tx.category.findUnique({
      where: { id: order.categoryId },
      include: { workflows: true },
    });
    if (!category) throw new AppError("Category not found", 404);

    const workflow = category.workflows.find((w) => w.key === order.selectedWorkflow);
    if (!workflow) throw new AppError("Workflow not found for this order's category", 400);

    return { order, offer, workflowSteps: workflow.steps };
  }

  static async createSession(input: {
    orderId: string;
    offerId: string;
    customerId: string;
    supplierId: string;
  }) {
    const { orderId, offerId, customerId, supplierId } = input;

    const createdSession = await prisma
      .$transaction(async (tx) => {
        const { workflowSteps } = await this.validateSessionCreationInput(
          { orderId, offerId, customerId, supplierId },
          tx,
        );

        const existingCustomerSession = await SessionRepository.findActiveByUser(
          customerId,
          tx,
        );
        if (existingCustomerSession && existingCustomerSession.customerId === customerId) {
          throw new AppError("Customer already has an active session", 400);
        }

        const existingSupplierSession = await SessionRepository.findActiveByUser(
          supplierId,
          tx,
        );
        if (existingSupplierSession && existingSupplierSession.supplierId === supplierId) {
          throw new AppError("Supplier already has an active session", 400);
        }

        return SessionRepository.createSession(
          {
            orderId,
            offerId,
            customerId,
            supplierId,
            workflowSteps,
            status: SESSION_STATUS.STARTED,
            startedAt: new Date(),
          },
          tx,
        );
      })
      .catch((error: any) => {
        if (error?.code === "P2002") {
          throw new AppError(
            "Session already exists or active session conflict occurred",
            409,
          );
        }
        throw error;
      });

    const populatedSession = await populateSessionData(createdSession);
    await SessionEventService.notifySessionCreated(populatedSession);

    return {
      success: true,
      message: "Session created successfully",
      data: populatedSession,
    };
  }

  static async getSessionById(input: { sessionId: string; userId: string }) {
    const session = await SessionRepository.findById(input.sessionId);
    if (!session) throw new AppError("Session not found", 404);

    this.ensureParticipant(session, input.userId);

    const populatedSession = await populateSessionData(session);
    return { success: true, data: { session: populatedSession } };
  }

  static async getActiveSessionForUser(userId: string) {
    const session = await SessionRepository.findActiveByUser(userId);
    if (!session) return { success: true, active: false };

    const populatedSession = await populateSessionData(session);
    return { success: true, active: true, data: { session: populatedSession } };
  }

  static async updateSessionStatus(input: {
    sessionId: string;
    actorUserId: string;
    nextStatus: string;
    reason?: string;
  }) {
    const { sessionId, actorUserId, nextStatus, reason } = input;

    const result = await prisma.$transaction(async (tx) => {
      const session = await SessionRepository.findById(sessionId, tx);
      if (!session) throw new AppError("Session not found", 404);

      this.ensureParticipant(session, actorUserId);

      if (nextStatus === SESSION_STATUS.COMPLETED) {
        throw new AppError("Use the complete endpoint to finish a session", 400);
      }

      if (nextStatus === SESSION_STATUS.CANCELLED) {
        if (!canCancelSession(session.status)) {
          throw new AppError("Session cannot be cancelled now", 400);
        }

        const isCustomer = session.customerId === actorUserId;
        const cancelledBy = isCustomer
          ? SESSION_CANCELLED_BY.CUSTOMER
          : SESSION_CANCELLED_BY.SUPPLIER;

        const updated = await SessionRepository.markCancelled(
          sessionId,
          session.status,
          cancelledBy,
          reason,
          tx,
        );
        if (!updated) throw new AppError("Failed to cancel session", 409);

        let relatedOrder: any = null;

        if (session.orderId && session.offerId) {
          relatedOrder = await tx.order.findUnique({ where: { id: session.orderId } });
          if (!relatedOrder) throw new AppError("Associated order not found", 404);

          await tx.offer.update({
            where: { id: session.offerId },
            data: isCustomer
              ? { status: OfferStatus.rejected, rejectedAt: new Date() }
              : { status: OfferStatus.withdrawn, withdrawnAt: new Date() },
          });

          if (isCustomer) {
            await tx.offer.updateMany({
              where: { orderId: relatedOrder.id, status: OfferStatus.pending },
              data: { status: OfferStatus.rejected, rejectedAt: new Date() },
            });
            await OrderRepository.markCancelled(
              {
                orderId: relatedOrder.id,
                cancelledBy: ORDER_CANCELLED_BY.CUSTOMER,
                cancellationReason: reason || "customer_cancelled_session",
              },
              tx,
            );
          } else {
            await OrderRepository.resetToPending(relatedOrder.id, tx);
          }
        } else if (session.bundleBookingId) {
          await tx.bundleBooking.update({
            where: { id: session.bundleBookingId },
            data: {
              status: BundleBookingStatus.cancelled,
              cancelledBy: isCustomer ? "customer" : "supplier",
            },
          });
        }

        return { updated, cancelledBy, relatedOrder };
      }

      this.ensureSupplier(session, actorUserId);
      const currentStep = session.currentStep || SESSION_STATUS.STARTED;
      assertValidSessionTransition(session.workflowSteps, currentStep, nextStatus);

      const currentTimestamps = (session.stepTimestamps as Record<string, any>) || {};
      const nextTimestamps = {
        ...currentTimestamps,
        [nextStatus]: new Date().toISOString(),
      };

      const updated = await SessionRepository.updateStatus(
        sessionId,
        session.status,
        nextStatus,
        { stepTimestamps: nextTimestamps },
        tx,
      );
      if (!updated) throw new AppError("Failed to update session status", 409);

      return { updated, cancelledBy: null, relatedOrder: null };
    });

    const { updated, cancelledBy, relatedOrder } = result;
    const populatedSession = await populateSessionData(updated);

    if (nextStatus !== SESSION_STATUS.CANCELLED) {
      SessionEventService.emitSessionToParticipants(
        socketEvents.SESSION_STATUS_UPDATED,
        populatedSession,
        { status: nextStatus },
      );

      await SessionEventService.notifySessionStatusUpdated(populatedSession, nextStatus);

      return {
        success: true,
        message: `Session status updated to "${nextStatus}"`,
        data: { session: populatedSession },
      };
    }

    if (cancelledBy === SESSION_CANCELLED_BY.CUSTOMER && relatedOrder) {
      await OrderEventService.emitOrderCancelled(
        relatedOrder.id,
        relatedOrder.categoryId,
        relatedOrder.governmentId,
        {
          actorId: actorUserId,
          actorRole: "customer",
          reason: reason || "customer_cancelled_session",
        },
      );
    }

    if (cancelledBy === SESSION_CANCELLED_BY.SUPPLIER && relatedOrder) {
      await OrderEventService.emitOrderAvailableAgain(
        relatedOrder.id,
        relatedOrder.categoryId,
        relatedOrder.governmentId,
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
      cancelledBy as "customer" | "supplier",
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

  static async completeSession(input: { sessionId: string; actorUserId: string }) {
    const { sessionId, actorUserId } = input;

    const completedSession = await prisma.$transaction(async (tx) => {
      const session = await SessionRepository.findById(sessionId, tx);
      if (!session) throw new AppError("Session not found", 404);

      this.ensureSupplier(session, actorUserId);

      if (isSessionTerminal(session.status)) {
        throw new AppError(`Session is already ${session.status}`, 400);
      }
      if (!canCompleteSession(session)) {
        throw new AppError("Session cannot be completed from its current step", 400);
      }

      const lastWorkflowStep =
        session.workflowSteps[session.workflowSteps.length - 1] ?? SESSION_STATUS.STARTED;

      const completed = await SessionRepository.markCompleted(
        sessionId,
        lastWorkflowStep,
        tx,
      );
      if (!completed) throw new AppError("Failed to complete session", 409);

      if (session.orderId && session.offerId) {
        const [completedOrder, completedOffer] = await Promise.all([
          OrderRepository.markCompleted(session.orderId, tx),
          OfferRepository.markCompleted(session.offerId, tx),
        ]);
        if (!completedOrder) throw new AppError("Failed to complete order", 409);
        if (!completedOffer) throw new AppError("Failed to complete offer", 409);
      } else if (session.bundleBookingId) {
        await tx.bundleBooking.update({
          where: { id: session.bundleBookingId },
          data: {
            status: BundleBookingStatus.completed,
            paymentConfirmed: true,
            paymentConfirmedAt: new Date(),
          },
        });
      }

      return completed;
    });

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

  static async getSessionByOrder(input: { orderId: string; userId: string }) {
    const session = await SessionRepository.findByOrderId(input.orderId);
    if (!session) throw new AppError("Session not found", 404);

    this.ensureParticipant(session, input.userId);

    const populatedSession = await populateSessionData(session);
    return { success: true, data: { session: populatedSession } };
  }

  static async getSessionByBundleBooking(input: {
    bundleBookingId: string;
    userId: string;
  }) {
    const session = await SessionRepository.findByBundleBookingId(input.bundleBookingId);
    if (!session) throw new AppError("Session not found for this booking", 404);

    this.ensureParticipant(session, input.userId);

    const populatedSession = await populateSessionData(session);
    return { success: true, data: { session: populatedSession } };
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

    const updatedSession = await prisma.$transaction(async (tx) => {
      const session = await SessionRepository.findById(sessionId, tx);
      if (!session) throw new AppError("Session not found", 404);

      if (session.supplierId !== userId) {
        throw new AppError("Not allowed to confirm payment for this session", 403);
      }
      if (!canConfirmSessionPayment(session.status)) {
        throw new AppError("Payment can only be confirmed after session completion", 400);
      }

      const updated = await SessionRepository.confirmPayment(sessionId, tx);
      if (!updated) throw new AppError("Payment already confirmed", 409);
      return updated;
    });

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

    const isCustomer = session.customerId === input.actorUserId;
    const isSupplier = session.supplierId === input.actorUserId;

    if (
      session.status !== SessionStatus.completed &&
      session.status !== SessionStatus.cancelled
    ) {
      return {
        success: true,
        hasAction: true,
        action: SESSION_RESUME_ACTION.JOB_SESSION,
        session: populatedSession,
      };
    }

    if (session.status === SessionStatus.completed) {
      const reviewSource: any =
        (populatedSession as any)?.order || (populatedSession as any)?.bundleBooking;

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
