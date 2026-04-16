import { CallStatus, CallType, CallEndReason, Prisma } from "@prisma/client";
import prisma from "../../../shared/config/prisma";

type Tx = Prisma.TransactionClient;

const ACTIVE: CallStatus[] = [
  CallStatus.initiated,
  CallStatus.ringing,
  CallStatus.accepted,
];

const INCOMING: CallStatus[] = [CallStatus.initiated, CallStatus.ringing];

export class CallRepository {
  static createCall(
    data: {
      sessionId: string;
      callerId: string;
      receiverId: string;
      type?: CallType;
      status?: CallStatus;
      startedAt?: Date | null;
    },
    tx?: Tx,
  ) {
    return (tx ?? prisma).callSession.create({
      data: {
        sessionId: data.sessionId,
        callerId: data.callerId,
        receiverId: data.receiverId,
        type: data.type ?? CallType.audio,
        status: data.status ?? CallStatus.initiated,
        startedAt: data.startedAt ?? null,
      },
    });
  }

  static findById(callId: string, tx?: Tx) {
    return (tx ?? prisma).callSession.findUnique({ where: { id: callId } });
  }

  static findActiveCallBySessionId(sessionId: string, tx?: Tx) {
    return (tx ?? prisma).callSession.findFirst({
      where: { sessionId, status: { in: ACTIVE } },
    });
  }

  static findBySessionId(sessionId: string) {
    return prisma.callSession.findMany({
      where: { sessionId },
      orderBy: { createdAt: "desc" },
    });
  }

  static updateCall(callId: string, update: Prisma.CallSessionUpdateInput, tx?: Tx) {
    return (tx ?? prisma).callSession.update({
      where: { id: callId },
      data: update,
    });
  }

  static async acceptCall(callId: string, receiverId: string, tx?: Tx) {
    const client = tx ?? prisma;
    const res = await client.callSession.updateMany({
      where: { id: callId, receiverId, status: { in: INCOMING } },
      data: { status: CallStatus.accepted, answeredAt: new Date() },
    });
    if (res.count === 0) return null;
    return client.callSession.findUnique({ where: { id: callId } });
  }

  static async declineCall(callId: string, receiverId: string, tx?: Tx) {
    const client = tx ?? prisma;
    const res = await client.callSession.updateMany({
      where: { id: callId, receiverId, status: { in: INCOMING } },
      data: {
        status: CallStatus.declined,
        endedAt: new Date(),
        endReason: CallEndReason.declined,
      },
    });
    if (res.count === 0) return null;
    return client.callSession.findUnique({ where: { id: callId } });
  }

  static async markMissed(callId: string, tx?: Tx) {
    const client = tx ?? prisma;
    const res = await client.callSession.updateMany({
      where: { id: callId, status: { in: INCOMING } },
      data: {
        status: CallStatus.missed,
        endedAt: new Date(),
        endReason: CallEndReason.missed,
      },
    });
    if (res.count === 0) return null;
    return client.callSession.findUnique({ where: { id: callId } });
  }
}
