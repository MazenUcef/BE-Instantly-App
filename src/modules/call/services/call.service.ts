import prisma from "../../../shared/config/prisma";
import { CallStatus, CallType, CallEndReason } from "@prisma/client";
import { AppError } from "../../../shared/middlewares/errorHandler";
import { CallRepository } from "../repositories/call.repository";
import { CallEventService } from "./call-event.service";
import {
  CALL_BLOCKED_SESSION_STATUSES,
} from "../../../shared/constants/call.constants";

const userSelect = {
  id: true,
  firstName: true,
  lastName: true,
  profilePicture: true,
  email: true,
  phoneNumber: true,
  role: true,
  address: true,
} as const;

const buildCallPayload = async (callId: string) => {
  const call = await prisma.callSession.findUnique({
    where: { id: callId },
    include: {
      caller: { select: userSelect },
      receiver: { select: userSelect },
      session: true,
    },
  });
  if (!call) return null;
  return call;
};

const FINISHED: CallStatus[] = [
  CallStatus.ended,
  CallStatus.declined,
  CallStatus.missed,
  CallStatus.failed,
];

export class CallService {
  private static async validateSessionAccess(sessionId: string, userId: string) {
    const session = await prisma.jobSession.findUnique({
      where: { id: sessionId },
    });
    if (!session) throw new AppError("Session not found", 404);

    if ((CALL_BLOCKED_SESSION_STATUSES as readonly string[]).includes(session.status)) {
      throw new AppError("Session is not active", 403);
    }

    if (session.customerId !== userId && session.supplierId !== userId) {
      throw new AppError("Not allowed in this session", 403);
    }

    return session;
  }

  private static async getCallForParticipant(callId: string, userId: string) {
    const call = await CallRepository.findById(callId);
    if (!call) throw new AppError("Call not found", 404);

    const isCaller = call.callerId === userId;
    const isReceiver = call.receiverId === userId;
    if (!isCaller && !isReceiver) throw new AppError("Not allowed", 403);

    return { call, isCaller, isReceiver };
  }

  static async startCall(input: {
    sessionId: string;
    callerId: string;
    type?: CallType;
  }) {
    const { sessionId, callerId, type = CallType.audio } = input;
    const sessionDoc = await this.validateSessionAccess(sessionId, callerId);

    const receiverId =
      sessionDoc.customerId === callerId
        ? sessionDoc.supplierId
        : sessionDoc.customerId;

    const createdCall = await prisma.$transaction(async (tx) => {
      const existingActive = await CallRepository.findActiveCallBySessionId(
        sessionId,
        tx,
      );
      if (existingActive) {
        const error = new AppError(
          "There is already an active call for this session",
          409,
        );
        (error as any).callId = existingActive.id;
        throw error;
      }

      return CallRepository.createCall(
        {
          sessionId,
          callerId,
          receiverId,
          type,
          status: CallStatus.ringing,
          startedAt: new Date(),
        },
        tx,
      );
    });

    const payload = await buildCallPayload(createdCall.id);
    CallEventService.emitIncoming(payload);
    CallEventService.emitRinging(payload);
    await CallEventService.notifyIncoming(payload);

    return { success: true, message: "Call started successfully", call: payload };
  }

  static async acceptCall(input: { callId: string; userId: string }) {
    const updated = await CallRepository.acceptCall(input.callId, input.userId);
    if (!updated) throw new AppError("Call can no longer be accepted", 400);

    const payload = await buildCallPayload(updated.id);
    CallEventService.emitAccepted(payload);
    return { success: true, message: "Call accepted", call: payload };
  }

  static async declineCall(input: { callId: string; userId: string }) {
    const updated = await CallRepository.declineCall(input.callId, input.userId);
    if (!updated) throw new AppError("Call can no longer be declined", 400);

    const payload = await buildCallPayload(updated.id);
    CallEventService.emitDeclined(payload);
    await CallEventService.notifyDeclined(payload);
    return { success: true, message: "Call declined", call: payload };
  }

  static async endCall(input: { callId: string; userId: string }) {
    const { call, isCaller } = await this.getCallForParticipant(
      input.callId,
      input.userId,
    );

    if (FINISHED.includes(call.status)) {
      throw new AppError("Call already finished", 400);
    }

    const updated = await CallRepository.updateCall(input.callId, {
      status: CallStatus.ended,
      endedAt: new Date(),
      endReason: isCaller ? CallEndReason.caller_ended : CallEndReason.receiver_ended,
    });
    if (!updated) throw new AppError("Failed to end call", 409);

    const payload = await buildCallPayload(updated.id);
    CallEventService.emitEnded(payload, input.userId);
    return { success: true, message: "Call ended", call: payload };
  }

  static async markMissedCall(input: { callId: string; userId: string }) {
    await this.getCallForParticipant(input.callId, input.userId);
    const updated = await CallRepository.markMissed(input.callId);
    if (!updated) throw new AppError("Call cannot be marked as missed", 400);

    const payload = await buildCallPayload(updated.id);
    CallEventService.emitMissed(payload);
    await CallEventService.notifyMissed(payload);
    return { success: true, message: "Call marked as missed", call: payload };
  }

  static async getSessionCallHistory(input: { sessionId: string; userId: string }) {
    await this.validateSessionAccess(input.sessionId, input.userId);
    const calls = await CallRepository.findBySessionId(input.sessionId);

    const enriched = await Promise.all(calls.map((c) => buildCallPayload(c.id)));
    return {
      success: true,
      count: enriched.filter(Boolean).length,
      calls: enriched.filter(Boolean),
    };
  }

  static async getIceConfig() {
    const iceServers: any[] = [];
    if (process.env.STUN_URL) {
      iceServers.push({ urls: [process.env.STUN_URL] });
    } else {
      iceServers.push({ urls: ["stun:stun.l.google.com:19302"] });
    }
    if (process.env.TURN_URL && process.env.TURN_USERNAME && process.env.TURN_CREDENTIAL) {
      iceServers.push({
        urls: [process.env.TURN_URL],
        username: process.env.TURN_USERNAME,
        credential: process.env.TURN_CREDENTIAL,
      });
    }
    return { success: true, iceServers };
  }
}
