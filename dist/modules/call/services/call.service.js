"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CallService = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const call_model_1 = __importDefault(require("../models/call.model"));
const session_model_1 = __importDefault(require("../../session/models/session.model"));
const User_model_1 = __importDefault(require("../../auth/models/User.model"));
const errorHandler_1 = require("../../../shared/middlewares/errorHandler");
const call_repository_1 = require("../repositories/call.repository");
const call_event_service_1 = require("./call-event.service");
const call_constants_1 = require("../../../shared/constants/call.constants");
const buildCallPayload = async (callId) => {
    const call = await call_model_1.default.findById(callId).lean();
    if (!call)
        return null;
    const [caller, receiver, session] = await Promise.all([
        User_model_1.default.findById(call.callerId)
            .select("-password -refreshToken -biometrics")
            .lean(),
        User_model_1.default.findById(call.receiverId)
            .select("-password -refreshToken -biometrics")
            .lean(),
        session_model_1.default.findById(call.sessionId).lean(),
    ]);
    return {
        ...call,
        caller: caller || null,
        receiver: receiver || null,
        session: session || null,
    };
};
class CallService {
    static async validateSessionAccess(sessionId, userId) {
        if (!mongoose_1.default.Types.ObjectId.isValid(sessionId)) {
            throw new errorHandler_1.AppError("Invalid session id", 400);
        }
        const session = await session_model_1.default.findById(sessionId);
        if (!session) {
            throw new errorHandler_1.AppError("Session not found", 404);
        }
        if (call_constants_1.CALL_BLOCKED_SESSION_STATUSES.includes(session.status)) {
            throw new errorHandler_1.AppError("Session is not active", 403);
        }
        const isCustomer = session.customerId.toString() === userId;
        const isSupplier = session.supplierId.toString() === userId;
        if (!isCustomer && !isSupplier) {
            throw new errorHandler_1.AppError("Not allowed in this session", 403);
        }
        return session;
    }
    static async getCallForParticipant(callId, userId) {
        const call = await call_repository_1.CallRepository.findById(callId);
        if (!call) {
            throw new errorHandler_1.AppError("Call not found", 404);
        }
        const isCaller = call.callerId.toString() === userId;
        const isReceiver = call.receiverId.toString() === userId;
        if (!isCaller && !isReceiver) {
            throw new errorHandler_1.AppError("Not allowed", 403);
        }
        return { call, isCaller, isReceiver };
    }
    static async startCall(input) {
        const { sessionId, callerId } = input;
        const sessionDoc = await this.validateSessionAccess(sessionId, callerId);
        const receiverId = sessionDoc.customerId.toString() === callerId
            ? sessionDoc.supplierId.toString()
            : sessionDoc.customerId.toString();
        const dbSession = await mongoose_1.default.startSession();
        let createdCall;
        try {
            await dbSession.withTransaction(async () => {
                const existingActiveCall = await call_repository_1.CallRepository.findActiveCallBySessionId(sessionId, dbSession);
                if (existingActiveCall) {
                    const error = new errorHandler_1.AppError("There is already an active call for this session", 409);
                    error.callId = existingActiveCall._id.toString();
                    throw error;
                }
                createdCall = await call_repository_1.CallRepository.createCall({
                    sessionId,
                    callerId,
                    receiverId,
                    type: call_constants_1.CALL_TYPE.AUDIO,
                    status: call_constants_1.CALL_STATUS.RINGING,
                    startedAt: new Date(),
                }, dbSession);
            });
        }
        finally {
            await dbSession.endSession();
        }
        const payload = await buildCallPayload(createdCall._id.toString());
        call_event_service_1.CallEventService.emitIncoming(payload);
        call_event_service_1.CallEventService.emitRinging(payload);
        await call_event_service_1.CallEventService.notifyIncoming(payload);
        return {
            success: true,
            message: "Call started successfully",
            call: payload,
        };
    }
    static async acceptCall(input) {
        const updatedCall = await call_repository_1.CallRepository.acceptCall(input.callId, input.userId);
        if (!updatedCall) {
            throw new errorHandler_1.AppError("Call can no longer be accepted", 400);
        }
        const payload = await buildCallPayload(updatedCall._id.toString());
        call_event_service_1.CallEventService.emitAccepted(payload);
        return {
            success: true,
            message: "Call accepted",
            call: payload,
        };
    }
    static async declineCall(input) {
        const updatedCall = await call_repository_1.CallRepository.declineCall(input.callId, input.userId);
        if (!updatedCall) {
            throw new errorHandler_1.AppError("Call can no longer be declined", 400);
        }
        const payload = await buildCallPayload(updatedCall._id.toString());
        call_event_service_1.CallEventService.emitDeclined(payload);
        await call_event_service_1.CallEventService.notifyDeclined(payload);
        return {
            success: true,
            message: "Call declined",
            call: payload,
        };
    }
    static async endCall(input) {
        const { call, isCaller, isReceiver } = await this.getCallForParticipant(input.callId, input.userId);
        if (!isCaller && !isReceiver) {
            throw new errorHandler_1.AppError("Not allowed to end this call", 403);
        }
        if (["ended", "declined", "missed", "failed"].includes(call.status)) {
            throw new errorHandler_1.AppError("Call already finished", 400);
        }
        const updatedCall = await call_repository_1.CallRepository.updateCall(input.callId, {
            status: call_constants_1.CALL_STATUS.ENDED,
            endedAt: new Date(),
            endReason: isCaller
                ? call_constants_1.CALL_END_REASON.CALLER_ENDED
                : call_constants_1.CALL_END_REASON.RECEIVER_ENDED,
        });
        if (!updatedCall) {
            throw new errorHandler_1.AppError("Failed to end call", 409);
        }
        const payload = await buildCallPayload(updatedCall._id.toString());
        call_event_service_1.CallEventService.emitEnded(payload, input.userId);
        return {
            success: true,
            message: "Call ended",
            call: payload,
        };
    }
    static async markMissedCall(input) {
        const { call, isCaller, isReceiver } = await this.getCallForParticipant(input.callId, input.userId);
        void isCaller;
        void isReceiver;
        const updatedCall = await call_repository_1.CallRepository.markMissed(input.callId);
        if (!updatedCall) {
            throw new errorHandler_1.AppError("Call cannot be marked as missed", 400);
        }
        const payload = await buildCallPayload(updatedCall._id.toString());
        call_event_service_1.CallEventService.emitMissed(payload);
        await call_event_service_1.CallEventService.notifyMissed(payload);
        return {
            success: true,
            message: "Call marked as missed",
            call: payload,
        };
    }
    static async getSessionCallHistory(input) {
        await this.validateSessionAccess(input.sessionId, input.userId);
        const calls = await call_repository_1.CallRepository.findBySessionId(input.sessionId);
        const enriched = await Promise.all(calls.map((call) => buildCallPayload(call._id.toString())));
        return {
            success: true,
            count: enriched.filter(Boolean).length,
            calls: enriched.filter(Boolean),
        };
    }
    static async getIceConfig() {
        const iceServers = [];
        if (process.env.STUN_URL) {
            iceServers.push({ urls: [process.env.STUN_URL] });
        }
        else {
            iceServers.push({ urls: ["stun:stun.l.google.com:19302"] });
        }
        if (process.env.TURN_URL &&
            process.env.TURN_USERNAME &&
            process.env.TURN_CREDENTIAL) {
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
exports.CallService = CallService;
