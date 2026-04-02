import {
  getIO,
  socketEvents,
  socketRooms,
} from "../../../shared/config/socket";
import { SESSION_NOTIFICATION_TYPES } from "../../../shared/constants/session.constants";
import { publishNotification } from "../../notification/notification.publisher";

export class SessionEventService {
  static emitSessionToParticipants(
    eventName: string,
    session: any,
    extra: Record<string, any> = {},
  ) {
    const io = getIO();

    const payload = {
      sessionId: session._id.toString(),
      session,
      ...extra,
    };

    io.to(socketRooms.chat(session._id.toString())).emit(eventName, payload);
    io.to(socketRooms.user(session.customerId.toString())).emit(
      eventName,
      payload,
    );
    io.to(socketRooms.user(session.supplierId.toString())).emit(
      eventName,
      payload,
    );
  }

  static async notifySessionCreated(session: any) {
    await Promise.all([
      publishNotification({
        userId: session.customerId.toString(),
        type: SESSION_NOTIFICATION_TYPES.SESSION_CREATED,
        title: "New Job Started",
        message: `A new job has started for order #${session.orderId}.`,
        data: {
          sessionId: session._id.toString(),
          orderId: session.orderId.toString(),
          offerId: session.offerId.toString(),
          supplierId: session.supplierId.toString(),
        },
      }),
      publishNotification({
        userId: session.supplierId.toString(),
        type: SESSION_NOTIFICATION_TYPES.SESSION_CREATED,
        title: "New Job Assigned",
        message: `You have been assigned a job for order #${session.orderId}.`,
        data: {
          sessionId: session._id.toString(),
          orderId: session.orderId.toString(),
          offerId: session.offerId.toString(),
          customerId: session.customerId.toString(),
        },
      }),
    ]);
  }

  static async notifySessionStatusUpdated(session: any, status: string) {
    await publishNotification({
      userId: session.customerId.toString(),
      type: SESSION_NOTIFICATION_TYPES.SUPPLIER_STATUS_UPDATE,
      title: "Supplier Status Update",
      message: `Your supplier updated the session to "${status}" for order #${session.orderId}.`,
      data: {
        sessionId: session._id.toString(),
        orderId: session.orderId.toString(),
        supplierId: session.supplierId.toString(),
        status,
      },
    });
  }

  static async notifySessionCancelled(
    session: any,
    cancelledBy: "customer" | "supplier",
  ) {
    await Promise.all([
      publishNotification({
        userId: session.customerId.toString(),
        type: SESSION_NOTIFICATION_TYPES.SESSION_CANCELLED,
        title: "Session Cancelled",
        message:
          cancelledBy === "customer"
            ? `You cancelled the job for order #${session.orderId}.`
            : `The supplier cancelled the job for order #${session.orderId}. Your order is available again.`,
        data: {
          sessionId: session._id.toString(),
          orderId: session.orderId.toString(),
          cancelledBy,
        },
      }),
      publishNotification({
        userId: session.supplierId.toString(),
        type: SESSION_NOTIFICATION_TYPES.SESSION_CANCELLED,
        title: "Session Cancelled",
        message:
          cancelledBy === "customer"
            ? `The customer cancelled the job for order #${session.orderId}.`
            : `You cancelled the job for order #${session.orderId}.`,
        data: {
          sessionId: session._id.toString(),
          orderId: session.orderId.toString(),
          cancelledBy,
        },
      }),
    ]);
  }

  static async notifySessionCompleted(session: any) {
    await Promise.all([
      publishNotification({
        userId: session.customerId.toString(),
        type: SESSION_NOTIFICATION_TYPES.SESSION_COMPLETED,
        title: "Job Completed",
        message: `Your job for order #${session.orderId} has been completed.`,
        data: {
          sessionId: session._id.toString(),
          orderId: session.orderId.toString(),
        },
      }),
      publishNotification({
        userId: session.supplierId.toString(),
        type: SESSION_NOTIFICATION_TYPES.SESSION_COMPLETED,
        title: "Job Completed",
        message: `You completed the job for order #${session.orderId}.`,
        data: {
          sessionId: session._id.toString(),
          orderId: session.orderId.toString(),
        },
      }),
    ]);
  }

  static async notifyPaymentConfirmed(session: any) {
    await Promise.all([
      publishNotification({
        userId: session.customerId.toString(),
        type: SESSION_NOTIFICATION_TYPES.SESSION_PAYMENT_CONFIRMED,
        title: "Payment Confirmed",
        message: `Payment was confirmed for order #${session.orderId}.`,
        data: {
          sessionId: session._id.toString(),
          orderId: session.orderId.toString(),
        },
      }),
      publishNotification({
        userId: session.supplierId.toString(),
        type: SESSION_NOTIFICATION_TYPES.SESSION_PAYMENT_CONFIRMED,
        title: "Payment Confirmed",
        message: `Payment was confirmed for order #${session.orderId}.`,
        data: {
          sessionId: session._id.toString(),
          orderId: session.orderId.toString(),
        },
      }),
    ]);
  }
}