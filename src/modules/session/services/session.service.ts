import mongoose from "mongoose";
import Order from "../../order/models/order.model";
import Offer from "../../offer/models/Offer.model";
import UserModel from "../../auth/models/User.model";
import { AppError } from "../../../shared/middlewares/errorHandler";
import { SessionRepository } from "../repositories/session.repository";
import { SessionEventService } from "./session-event.service";
import { buildSupplierOrderPayload } from "../../../shared/utils/buildSupplierOrderPayload";
import {
  getIO,
  socketEvents,
  socketRooms,
} from "../../../shared/config/socket";
import { SESSION_STATUS } from "../../../shared/constants/session.constants";

const SESSION_STATUS_TO_TIMESTAMP_FIELD: Record<string, string> = {
  [SESSION_STATUS.ON_THE_WAY]: "onTheWayAt",
  [SESSION_STATUS.ARRIVED]: "arrivedAt",
  [SESSION_STATUS.WORK_STARTED]: "workStartedAt",
};

const populateSessionData = async (session: any) => {
  if (!session) return null;

  const sessionObj = session.toObject ? session.toObject() : session;

  const [order, offer, customer, supplier] = await Promise.all([
    Order.findById(session.orderId)
      .populate("categoryId", "name icon")
      .populate("governmentId", "name nameAr")
      .lean(),
    Offer.findById(session.offerId).lean(),
    UserModel.findById(session.customerId)
      .select("-password -refreshToken -biometrics")
      .lean(),
    UserModel.findById(session.supplierId)
      .select("-password -refreshToken -biometrics")
      .lean(),
  ]);

  return {
    ...sessionObj,
    order: order || null,
    offer: offer || null,
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

  private static ensureValidProgressTransition(
    currentStatus: string,
    nextStatus: string,
  ) {
    const transitions: Record<string, string[]> = {
      [SESSION_STATUS.STARTED]: [SESSION_STATUS.ON_THE_WAY],
      [SESSION_STATUS.ON_THE_WAY]: [SESSION_STATUS.ARRIVED],
      [SESSION_STATUS.ARRIVED]: [SESSION_STATUS.WORK_STARTED],
      [SESSION_STATUS.WORK_STARTED]: [],
    };

    const allowedNext = transitions[currentStatus] || [];

    if (!allowedNext.includes(nextStatus)) {
      throw new AppError(
        `Invalid session status transition from "${currentStatus}" to "${nextStatus}"`,
        400,
      );
    }
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
            status: SESSION_STATUS.STARTED,
            startedAt: new Date(),
          },
          dbSession,
        );
      });
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
      data: populatedSession,
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
      session: populatedSession,
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

        if (nextStatus === SESSION_STATUS.CANCELLED) {
          const isCustomer = session.customerId.toString() === actorUserId;
          const isSupplier = session.supplierId.toString() === actorUserId;

          cancelledBy = isCustomer ? "customer" : "supplier";

          updatedSession = await SessionRepository.markCancelled(
            sessionId,
            cancelledBy,
            reason,
            dbSession,
          );

          if (!updatedSession) {
            throw new AppError("Failed to cancel session", 409);
          }

          relatedOrder = await Order.findById(session.orderId).session(
            dbSession || null,
          );

          if (!relatedOrder) {
            throw new AppError("Associated order not found", 404);
          }

          await Offer.findByIdAndUpdate(
            session.offerId,
            { status: "rejected", rejectedAt: new Date() },
            { session: dbSession, new: true },
          );

          if (isCustomer) {
            await Offer.updateMany(
              { orderId: relatedOrder._id, status: "pending" },
              { $set: { status: "rejected", rejectedAt: new Date() } },
              { session: dbSession },
            );

            await Order.findByIdAndDelete(relatedOrder._id, {
              session: dbSession,
            });
          }

          if (isSupplier) {
            await Order.findByIdAndUpdate(
              relatedOrder._id,
              { status: "pending", supplierId: null },
              { session: dbSession, new: true },
            );
          }

          return;
        }

        this.ensureSupplier(session, actorUserId);
        this.ensureValidProgressTransition(session.status, nextStatus);

        const timestampField = SESSION_STATUS_TO_TIMESTAMP_FIELD[nextStatus];
        const extraSet = timestampField ? { [timestampField]: new Date() } : {};

        updatedSession = await SessionRepository.updateStatus(
          sessionId,
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
    const io = getIO();

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
        session: populatedSession,
      };
    }

    if (cancelledBy === "customer" && relatedOrder) {
      io.to(
        socketRooms.supplierOrders(
          relatedOrder.categoryId.toString(),
          relatedOrder.governmentId.toString(),
        ),
      ).emit(socketEvents.ORDER_DELETED, {
        orderId: relatedOrder._id.toString(),
        reason: "customer_cancelled_session",
        timestamp: new Date(),
      });
    }

    if (cancelledBy === "supplier" && relatedOrder) {
      const supplierOrderPayload = await buildSupplierOrderPayload(
        relatedOrder._id.toString(),
      );

      if (supplierOrderPayload) {
        io.to(
          socketRooms.supplierOrders(
            relatedOrder.categoryId.toString(),
            relatedOrder.governmentId.toString(),
          ),
        ).emit(socketEvents.ORDER_AVAILABLE_AGAIN, {
          orderId: relatedOrder._id.toString(),
          order: supplierOrderPayload,
          reason: "supplier_cancelled_session",
          timestamp: new Date(),
        });
      }
    }

    SessionEventService.emitSessionToParticipants(
      socketEvents.SESSION_CANCELLED,
      populatedSession,
      { cancelledBy },
    );

    await SessionEventService.notifySessionCancelled(
      populatedSession,
      cancelledBy!,
    );

    return {
      success: true,
      message:
        cancelledBy === "customer"
          ? "Session cancelled and order deleted"
          : "Session cancelled and order returned to pending",
      session: populatedSession,
      orderStatus: cancelledBy === "supplier" ? "pending" : "deleted",
      cancelledBy,
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

        if (session.status !== SESSION_STATUS.WORK_STARTED) {
          throw new AppError(
            "Session can only be completed after work has started",
            400,
          );
        }

        completedSession = await SessionRepository.markCompleted(
          sessionId,
          dbSession,
        );

        if (!completedSession) {
          throw new AppError("Failed to complete session", 409);
        }

        await Promise.all([
          Order.findByIdAndUpdate(
            session.orderId,
            { status: "completed" },
            { new: true, session: dbSession },
          ),
          Offer.findByIdAndUpdate(
            session.offerId,
            { status: "completed", completedAt: new Date() },
            { new: true, session: dbSession },
          ),
        ]);
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
      session: populatedSession,
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
      data: populatedSession,
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

        if (session.status !== SESSION_STATUS.COMPLETED) {
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
      session: populatedSession,
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
        action: "none",
        session: null,
      };
    }

    const populatedSession = await populateSessionData(session);
    const order = populatedSession?.order;

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
        action: "job_session",
        session: populatedSession,
      };
    }

    if (session.status === SESSION_STATUS.COMPLETED) {
      if (isCustomer && !order?.customerReviewed) {
        return {
          success: true,
          hasAction: true,
          action: "review",
          session: populatedSession,
        };
      }

      if (isSupplier && !session.paymentConfirmed) {
        return {
          success: true,
          hasAction: true,
          action: "payment_confirmation",
          session: populatedSession,
        };
      }

      if (isSupplier && session.paymentConfirmed && !order?.supplierReviewed) {
        return {
          success: true,
          hasAction: true,
          action: "review",
          session: populatedSession,
        };
      }
    }

    return {
      success: true,
      hasAction: false,
      action: "none",
      session: populatedSession,
    };
  }
}