"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SessionRepository = void 0;
const session_model_1 = __importDefault(require("../models/session.model"));
const session_constants_1 = require("../../../shared/constants/session.constants");
class SessionRepository {
    static createSession(data, session) {
        return session_model_1.default.create([data], { session }).then((docs) => docs[0]);
    }
    static findById(sessionId, session) {
        return session_model_1.default.findById(sessionId).session(session || null);
    }
    static findByOrderId(orderId, session) {
        return session_model_1.default.findOne({ orderId }).session(session || null);
    }
    static findActiveByUser(userId, session) {
        return session_model_1.default.findOne({
            $or: [{ customerId: userId }, { supplierId: userId }],
            status: {
                $nin: [session_constants_1.SESSION_STATUS.COMPLETED, session_constants_1.SESSION_STATUS.CANCELLED],
            },
        }).session(session || null);
    }
    static findLatestByUser(userId) {
        return session_model_1.default.findOne({
            $or: [{ customerId: userId }, { supplierId: userId }],
        }).sort({ updatedAt: -1 });
    }
    static updateStatus(sessionId, status, extraSet = {}, session) {
        return session_model_1.default.findOneAndUpdate({
            _id: sessionId,
            status: { $nin: [session_constants_1.SESSION_STATUS.COMPLETED, session_constants_1.SESSION_STATUS.CANCELLED] },
        }, {
            $set: {
                status,
                ...extraSet,
            },
        }, { new: true, session });
    }
    static markCompleted(sessionId, session) {
        return session_model_1.default.findOneAndUpdate({
            _id: sessionId,
            status: { $nin: [session_constants_1.SESSION_STATUS.COMPLETED, session_constants_1.SESSION_STATUS.CANCELLED] },
        }, {
            $set: {
                status: session_constants_1.SESSION_STATUS.COMPLETED,
                completedAt: new Date(),
            },
        }, { new: true, session });
    }
    static markCancelled(sessionId, cancelledBy, cancellationReason, session) {
        return session_model_1.default.findOneAndUpdate({
            _id: sessionId,
            status: { $nin: [session_constants_1.SESSION_STATUS.COMPLETED, session_constants_1.SESSION_STATUS.CANCELLED] },
        }, {
            $set: {
                status: session_constants_1.SESSION_STATUS.CANCELLED,
                cancelledBy,
                cancellationReason: cancellationReason || null,
                cancelledAt: new Date(),
            },
        }, { new: true, session });
    }
    static confirmPayment(sessionId, session) {
        return session_model_1.default.findOneAndUpdate({
            _id: sessionId,
            status: session_constants_1.SESSION_STATUS.COMPLETED,
            paymentConfirmed: false,
        }, {
            $set: {
                paymentConfirmed: true,
                paymentConfirmedAt: new Date(),
            },
        }, { new: true, session });
    }
}
exports.SessionRepository = SessionRepository;
