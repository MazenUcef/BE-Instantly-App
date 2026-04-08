"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CallRepository = void 0;
const call_model_1 = __importDefault(require("../models/call.model"));
const call_constants_1 = require("../../../shared/constants/call.constants");
class CallRepository {
    static createCall(data, session) {
        return call_model_1.default.create([data], { session }).then((docs) => docs[0]);
    }
    static findById(callId, session) {
        return call_model_1.default.findById(callId).session(session || null);
    }
    static findActiveCallBySessionId(sessionId, session) {
        return call_model_1.default.findOne({
            sessionId,
            status: { $in: [...call_constants_1.ACTIVE_CALL_STATUSES] },
        }).session(session || null);
    }
    static findBySessionId(sessionId) {
        return call_model_1.default.find({ sessionId }).sort({ createdAt: -1 });
    }
    static updateCall(callId, update, session) {
        return call_model_1.default.findByIdAndUpdate(callId, { $set: update }, { new: true, session });
    }
    static acceptCall(callId, receiverId, session) {
        return call_model_1.default.findOneAndUpdate({
            _id: callId,
            receiverId,
            status: { $in: ["initiated", "ringing"] },
        }, {
            $set: {
                status: "accepted",
                answeredAt: new Date(),
            },
        }, { new: true, session });
    }
    static declineCall(callId, receiverId, session) {
        return call_model_1.default.findOneAndUpdate({
            _id: callId,
            receiverId,
            status: { $in: ["initiated", "ringing"] },
        }, {
            $set: {
                status: "declined",
                endedAt: new Date(),
                endReason: "declined",
            },
        }, { new: true, session });
    }
    static markMissed(callId, session) {
        return call_model_1.default.findOneAndUpdate({
            _id: callId,
            status: { $in: ["initiated", "ringing"] },
        }, {
            $set: {
                status: "missed",
                endedAt: new Date(),
                endReason: "missed",
            },
        }, { new: true, session });
    }
}
exports.CallRepository = CallRepository;
