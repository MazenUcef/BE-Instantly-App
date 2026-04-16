import {
  getIO,
  socketEvents,
  socketRooms,
} from "../../../shared/config/socket";
import { SESSION_NOTIFICATION_TYPES } from "../../../shared/constants/session.constants";
import { publishNotification } from "../../notification/notification.publisher";

type ActorRole = "customer" | "supplier" | "system" | "admin";

const getSessionRef = (session: any) => {
  if (session.orderId) return `order #${session.orderId}`;
  if (session.bundleBookingId) return `booking #${session.bundleBookingId}`;
  return "session";
};

const getSessionData = (session: any) => {
  const data: Record<string, any> = {
    sessionId: session.id,
  };
  if (session.orderId) {
    data.orderId = session.orderId;
    data.offerId = session.offerId || null;
  }
  if (session.bundleBookingId) {
    data.bundleBookingId = session.bundleBookingId;
  }
  return data;
};

export class SessionEventService {
  static emitSessionToParticipants(
    eventName: string,
    session: any,
    extra: Record<string, any> = {},
  ) {
    const io = getIO();

    const payload = {
      sessionId: session.id,
      session,
      ...extra,
    };

    io.to(socketRooms.chat(session.id)).emit(eventName, payload);
    io.to(socketRooms.user(session.customerId)).emit(
      eventName,
      payload,
    );
    io.to(socketRooms.user(session.supplierId)).emit(
      eventName,
      payload,
    );
  }

  static emitSessionCancelled(
    session: any,
    meta: {
      actorRole: ActorRole;
      actorId?: string;
      reason?: string | null;
    },
  ) {
    const io = getIO();

    const payload = {
      type: "session.cancelled",
      sessionId: session.id,
      session,
      meta: {
        actorId: meta.actorId || null,
        actorRole: meta.actorRole,
        reason: meta.reason || null,
        changedAt: new Date().toISOString(),
      },
    };

    io.to(socketRooms.chat(session.id)).emit(
      socketEvents.SESSION_CANCELLED,
      payload,
    );
    io.to(socketRooms.user(session.customerId)).emit(
      socketEvents.SESSION_CANCELLED,
      payload,
    );
    io.to(socketRooms.user(session.supplierId)).emit(
      socketEvents.SESSION_CANCELLED,
      payload,
    );
  }

  static async notifySessionCreated(session: any) {
    const ref = getSessionRef(session);
    const data = getSessionData(session);

    await Promise.all([
      publishNotification({
        userId: session.customerId,
        type: SESSION_NOTIFICATION_TYPES.SESSION_CREATED,
        title: "New Job Started",
        message: `A new job has started for ${ref}.`,
        data: { ...data, supplierId: session.supplierId },
      }),
      publishNotification({
        userId: session.supplierId,
        type: SESSION_NOTIFICATION_TYPES.SESSION_CREATED,
        title: "New Job Assigned",
        message: `You have been assigned a job for ${ref}.`,
        data: { ...data, customerId: session.customerId },
      }),
    ]);
  }

  static async notifySessionStatusUpdated(session: any, status: string) {
    const ref = getSessionRef(session);
    const data = getSessionData(session);

    await publishNotification({
      userId: session.customerId,
      type: SESSION_NOTIFICATION_TYPES.SUPPLIER_STATUS_UPDATE,
      title: "Supplier Status Update",
      message: `Your supplier updated the session to "${status}" for ${ref}.`,
      data: { ...data, supplierId: session.supplierId, status },
    });
  }

  static async notifySessionCancelled(
    session: any,
    cancelledBy: "customer" | "supplier",
  ) {
    const ref = getSessionRef(session);
    const data = getSessionData(session);

    await Promise.all([
      publishNotification({
        userId: session.customerId,
        type: SESSION_NOTIFICATION_TYPES.SESSION_CANCELLED,
        title: "Session Cancelled",
        message:
          cancelledBy === "customer"
            ? `You cancelled the job for ${ref}.`
            : `The supplier cancelled the job for ${ref}.`,
        data: { ...data, cancelledBy },
      }),
      publishNotification({
        userId: session.supplierId,
        type: SESSION_NOTIFICATION_TYPES.SESSION_CANCELLED,
        title: "Session Cancelled",
        message:
          cancelledBy === "customer"
            ? `The customer cancelled the job for ${ref}.`
            : `You cancelled the job for ${ref}.`,
        data: { ...data, cancelledBy },
      }),
    ]);
  }

  static async notifySessionCompleted(session: any) {
    const ref = getSessionRef(session);
    const data = getSessionData(session);

    await Promise.all([
      publishNotification({
        userId: session.customerId,
        type: SESSION_NOTIFICATION_TYPES.SESSION_COMPLETED,
        title: "Job Completed",
        message: `Your job for ${ref} has been completed.`,
        data,
      }),
      publishNotification({
        userId: session.supplierId,
        type: SESSION_NOTIFICATION_TYPES.SESSION_COMPLETED,
        title: "Job Completed",
        message: `You completed the job for ${ref}.`,
        data,
      }),
    ]);
  }

  static async notifyPaymentConfirmed(session: any) {
    const ref = getSessionRef(session);
    const data = getSessionData(session);

    await Promise.all([
      publishNotification({
        userId: session.customerId,
        type: SESSION_NOTIFICATION_TYPES.SESSION_PAYMENT_CONFIRMED,
        title: "Payment Confirmed",
        message: `Payment was confirmed for ${ref}.`,
        data,
      }),
      publishNotification({
        userId: session.supplierId,
        type: SESSION_NOTIFICATION_TYPES.SESSION_PAYMENT_CONFIRMED,
        title: "Payment Confirmed",
        message: `Payment was confirmed for ${ref}.`,
        data,
      }),
    ]);
  }
}
