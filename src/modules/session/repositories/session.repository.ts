import { Prisma, SessionStatus, SessionCancelledBy } from "@prisma/client";
import prisma from "../../../shared/config/prisma";

type Tx = Prisma.TransactionClient;

const NON_TERMINAL: SessionStatus[] = [SessionStatus.started];

export class SessionRepository {
  static createSession(
    data: {
      orderId?: string | null;
      offerId?: string | null;
      bundleBookingId?: string | null;
      customerId: string;
      supplierId: string;
      workflowSteps: string[];
      status?: string;
      startedAt?: Date;
    },
    tx?: Tx,
  ) {
    return (tx ?? prisma).jobSession.create({
      data: {
        orderId: data.orderId ?? null,
        offerId: data.offerId ?? null,
        bundleBookingId: data.bundleBookingId ?? null,
        customerId: data.customerId,
        supplierId: data.supplierId,
        workflowSteps: data.workflowSteps,
        status: (data.status as SessionStatus) ?? SessionStatus.started,
        startedAt: data.startedAt ?? new Date(),
      },
    });
  }

  static findById(sessionId: string, tx?: Tx) {
    return (tx ?? prisma).jobSession.findUnique({ where: { id: sessionId } });
  }

  static findByOrderId(orderId: string, tx?: Tx) {
    return (tx ?? prisma).jobSession.findFirst({ where: { orderId } });
  }

  static findByOfferId(offerId: string, tx?: Tx) {
    return (tx ?? prisma).jobSession.findFirst({ where: { offerId } });
  }

  static findByBundleBookingId(bundleBookingId: string, tx?: Tx) {
    return (tx ?? prisma).jobSession.findFirst({ where: { bundleBookingId } });
  }

  static findActiveByUser(userId: string, tx?: Tx) {
    return (tx ?? prisma).jobSession.findFirst({
      where: {
        OR: [{ customerId: userId }, { supplierId: userId }],
        status: { notIn: [SessionStatus.completed, SessionStatus.cancelled] },
      },
    });
  }

  static findLatestByUser(userId: string) {
    return prisma.jobSession.findFirst({
      where: {
        OR: [{ customerId: userId }, { supplierId: userId }],
      },
      orderBy: { updatedAt: "desc" },
    });
  }

  // `currentStatus` here historically held the current workflow step name or a
  // session lifecycle status — in Postgres we split those: workflow steps live
  // in stepTimestamps (Json), and session status is the enum. Callers that pass
  // a workflow step name should use updateWorkflowStep instead.
  static async updateStatus(
    sessionId: string,
    currentStatus: string,
    nextStatus: string,
    extraSet: Record<string, any> = {},
    tx?: Tx,
  ) {
    const client = tx ?? prisma;
    const res = await client.jobSession.updateMany({
      where: { id: sessionId, status: SessionStatus.started },
      data: { currentStep: nextStatus, ...extraSet },
    });
    if (res.count === 0) return null;
    return client.jobSession.findUnique({ where: { id: sessionId } });
  }

  static async markCompleted(sessionId: string, _lastWorkflowStep: string, tx?: Tx) {
    const client = tx ?? prisma;
    const res = await client.jobSession.updateMany({
      where: { id: sessionId, status: { in: NON_TERMINAL } },
      data: { status: SessionStatus.completed, completedAt: new Date() },
    });
    if (res.count === 0) return null;
    return client.jobSession.findUnique({ where: { id: sessionId } });
  }

  static async markCancelled(
    sessionId: string,
    _currentStatus: string,
    cancelledBy: "customer" | "supplier",
    cancellationReason?: string,
    tx?: Tx,
  ) {
    const client = tx ?? prisma;
    const res = await client.jobSession.updateMany({
      where: { id: sessionId, status: { in: NON_TERMINAL } },
      data: {
        status: SessionStatus.cancelled,
        cancelledBy: cancelledBy as SessionCancelledBy,
        cancellationReason: cancellationReason ?? null,
        cancelledAt: new Date(),
      },
    });
    if (res.count === 0) return null;
    return client.jobSession.findUnique({ where: { id: sessionId } });
  }

  static async confirmPayment(sessionId: string, tx?: Tx) {
    const client = tx ?? prisma;
    const res = await client.jobSession.updateMany({
      where: {
        id: sessionId,
        status: SessionStatus.completed,
        paymentConfirmed: false,
      },
      data: { paymentConfirmed: true, paymentConfirmedAt: new Date() },
    });
    if (res.count === 0) return null;
    return client.jobSession.findUnique({ where: { id: sessionId } });
  }
}
