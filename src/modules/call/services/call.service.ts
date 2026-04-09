import mongoose from "mongoose";
import CallSession from "../models/call.model";
import JobSession from "../../session/models/session.model";
import UserModel from "../../auth/models/User.model";
import { AppError } from "../../../shared/middlewares/errorHandler";
import { CallRepository } from "../repositories/call.repository";
import { CallEventService } from "./call-event.service";
import { CALL_BLOCKED_SESSION_STATUSES, CALL_END_REASON, CALL_STATUS, CALL_TYPE } from "../../../shared/constants/call.constants";

const buildCallPayload = async (callId: string) => {
  const call = await CallSession.findById(callId).lean();
  if (!call) return null;

  const [caller, receiver, session] = await Promise.all([
    UserModel.findById(call.callerId)
      .select("-password -refreshToken -biometrics")
      .lean(),
    UserModel.findById(call.receiverId)
      .select("-password -refreshToken -biometrics")
      .lean(),
    JobSession.findById(call.sessionId).lean(),
  ]);

  return {
    ...call,
    caller: caller || null,
    receiver: receiver || null,
    session: session || null,
  };
};

export class CallService {
  private static async validateSessionAccess(sessionId: string, userId: string) {
    if (!mongoose.Types.ObjectId.isValid(sessionId)) {
      throw new AppError("Invalid session id", 400);
    }

    const session = await JobSession.findById(sessionId);

    if (!session) {
      throw new AppError("Session not found", 404);
    }

    if (
      (CALL_BLOCKED_SESSION_STATUSES as readonly string[]).includes(session.status)
    ) {
      throw new AppError("Session is not active", 403);
    }

    const isCustomer = session.customerId.toString() === userId;
    const isSupplier = session.supplierId.toString() === userId;

    if (!isCustomer && !isSupplier) {
      throw new AppError("Not allowed in this session", 403);
    }

    return session;
  }

  private static async getCallForParticipant(callId: string, userId: string) {
    const call = await CallRepository.findById(callId);

    if (!call) {
      throw new AppError("Call not found", 404);
    }

    const isCaller = call.callerId.toString() === userId;
    const isReceiver = call.receiverId.toString() === userId;

    if (!isCaller && !isReceiver) {
      throw new AppError("Not allowed", 403);
    }

    return { call, isCaller, isReceiver };
  }

  static async startCall(input: {
    sessionId: string;
    callerId: string;
    type?: "audio" | "video";
  }) {
    const { sessionId, callerId, type = CALL_TYPE.AUDIO } = input;

    const sessionDoc = await this.validateSessionAccess(sessionId, callerId);

    const receiverId =
      sessionDoc.customerId.toString() === callerId
        ? sessionDoc.supplierId.toString()
        : sessionDoc.customerId.toString();

    const dbSession = await mongoose.startSession();
    let createdCall: any;

    try {
      await dbSession.withTransaction(async () => {
        const existingActiveCall = await CallRepository.findActiveCallBySessionId(
          sessionId,
          dbSession,
        );

        if (existingActiveCall) {
          const error = new AppError(
            "There is already an active call for this session",
            409,
          );
          (error as any).callId = existingActiveCall._id.toString();
          throw error;
        }

        createdCall = await CallRepository.createCall(
          {
            sessionId,
            callerId,
            receiverId,
            type,
            status: CALL_STATUS.RINGING,
            startedAt: new Date(),
          },
          dbSession,
        );
      });
    } finally {
      await dbSession.endSession();
    }

    const payload = await buildCallPayload(createdCall._id.toString());

    CallEventService.emitIncoming(payload);
    CallEventService.emitRinging(payload);
    await CallEventService.notifyIncoming(payload);

    return {
      success: true,
      message: "Call started successfully",
      call: payload,
    };
  }

  static async acceptCall(input: {
    callId: string;
    userId: string;
  }) {
    const updatedCall = await CallRepository.acceptCall(
      input.callId,
      input.userId,
    );

    if (!updatedCall) {
      throw new AppError("Call can no longer be accepted", 400);
    }

    const payload = await buildCallPayload(updatedCall._id.toString());

    CallEventService.emitAccepted(payload);

    return {
      success: true,
      message: "Call accepted",
      call: payload,
    };
  }

  static async declineCall(input: {
    callId: string;
    userId: string;
  }) {
    const updatedCall = await CallRepository.declineCall(
      input.callId,
      input.userId,
    );

    if (!updatedCall) {
      throw new AppError("Call can no longer be declined", 400);
    }

    const payload = await buildCallPayload(updatedCall._id.toString());

    CallEventService.emitDeclined(payload);
    await CallEventService.notifyDeclined(payload);

    return {
      success: true,
      message: "Call declined",
      call: payload,
    };
  }

  static async endCall(input: {
    callId: string;
    userId: string;
  }) {
    const { call, isCaller, isReceiver } = await this.getCallForParticipant(
      input.callId,
      input.userId,
    );

    if (!isCaller && !isReceiver) {
      throw new AppError("Not allowed to end this call", 403);
    }

    if (["ended", "declined", "missed", "failed"].includes(call.status)) {
      throw new AppError("Call already finished", 400);
    }

    const updatedCall = await CallRepository.updateCall(input.callId, {
      status: CALL_STATUS.ENDED,
      endedAt: new Date(),
      endReason: isCaller
        ? CALL_END_REASON.CALLER_ENDED
        : CALL_END_REASON.RECEIVER_ENDED,
    });

    if (!updatedCall) {
      throw new AppError("Failed to end call", 409);
    }

    const payload = await buildCallPayload(updatedCall._id.toString());

    CallEventService.emitEnded(payload, input.userId);

    return {
      success: true,
      message: "Call ended",
      call: payload,
    };
  }

  static async markMissedCall(input: {
    callId: string;
    userId: string;
  }) {
    const { call, isCaller, isReceiver } = await this.getCallForParticipant(
      input.callId,
      input.userId,
    );
    void isCaller;
    void isReceiver;

    const updatedCall = await CallRepository.markMissed(input.callId);

    if (!updatedCall) {
      throw new AppError("Call cannot be marked as missed", 400);
    }

    const payload = await buildCallPayload(updatedCall._id.toString());

    CallEventService.emitMissed(payload);
    await CallEventService.notifyMissed(payload);

    return {
      success: true,
      message: "Call marked as missed",
      call: payload,
    };
  }

  static async getSessionCallHistory(input: {
    sessionId: string;
    userId: string;
  }) {
    await this.validateSessionAccess(input.sessionId, input.userId);

    const calls = await CallRepository.findBySessionId(input.sessionId);

    const enriched = await Promise.all(
      calls.map((call) => buildCallPayload(call._id.toString())),
    );

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

    if (
      process.env.TURN_URL &&
      process.env.TURN_USERNAME &&
      process.env.TURN_CREDENTIAL
    ) {
      iceServers.push({
        urls: [process.env.TURN_URL],
        username: process.env.TURN_USERNAME,
        credential: process.env.TURN_CREDENTIAL,
      });
    }

    return {
      success: true,
      iceServers,
    };
  }
}