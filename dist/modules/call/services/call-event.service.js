"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CallEventService = void 0;
const socket_1 = require("../../../shared/config/socket");
const notification_publisher_1 = require("../../notification/notification.publisher");
const call_constants_1 = require("../../../shared/constants/call.constants");
class CallEventService {
    static emitIncoming(call) {
        const io = (0, socket_1.getIO)();
        io.to(socket_1.socketRooms.user(String(call.receiverId))).emit(call_constants_1.CALL_SOCKET_EVENTS.INCOMING, {
            callId: String(call._id),
            sessionId: String(call.sessionId),
            callerId: String(call.callerId),
            receiverId: String(call.receiverId),
            call,
            timestamp: new Date(),
        });
    }
    static emitRinging(call) {
        const io = (0, socket_1.getIO)();
        io.to(socket_1.socketRooms.user(String(call.callerId))).emit(call_constants_1.CALL_SOCKET_EVENTS.RINGING, {
            callId: String(call._id),
            sessionId: String(call.sessionId),
            receiverId: String(call.receiverId),
            call,
            timestamp: new Date(),
        });
    }
    static emitAccepted(call) {
        const io = (0, socket_1.getIO)();
        io.to(socket_1.socketRooms.user(String(call.callerId))).emit(call_constants_1.CALL_SOCKET_EVENTS.ACCEPTED, {
            callId: String(call._id),
            sessionId: String(call.sessionId),
            call,
            timestamp: new Date(),
        });
        io.to(socket_1.socketRooms.user(String(call.receiverId))).emit(call_constants_1.CALL_SOCKET_EVENTS.ACCEPTED, {
            callId: String(call._id),
            sessionId: String(call.sessionId),
            call,
            timestamp: new Date(),
        });
    }
    static emitDeclined(call) {
        const io = (0, socket_1.getIO)();
        io.to(socket_1.socketRooms.user(String(call.callerId))).emit(call_constants_1.CALL_SOCKET_EVENTS.DECLINED, {
            callId: String(call._id),
            sessionId: String(call.sessionId),
            call,
            timestamp: new Date(),
        });
        io.to(socket_1.socketRooms.user(String(call.receiverId))).emit(call_constants_1.CALL_SOCKET_EVENTS.DECLINED, {
            callId: String(call._id),
            sessionId: String(call.sessionId),
            call,
            timestamp: new Date(),
        });
    }
    static emitEnded(call, endedBy) {
        const io = (0, socket_1.getIO)();
        io.to(socket_1.socketRooms.user(String(call.callerId))).emit(call_constants_1.CALL_SOCKET_EVENTS.ENDED, {
            callId: String(call._id),
            sessionId: String(call.sessionId),
            call,
            endedBy,
            timestamp: new Date(),
        });
        io.to(socket_1.socketRooms.user(String(call.receiverId))).emit(call_constants_1.CALL_SOCKET_EVENTS.ENDED, {
            callId: String(call._id),
            sessionId: String(call.sessionId),
            call,
            endedBy,
            timestamp: new Date(),
        });
    }
    static emitMissed(call) {
        const io = (0, socket_1.getIO)();
        io.to(socket_1.socketRooms.user(String(call.callerId))).emit(call_constants_1.CALL_SOCKET_EVENTS.MISSED, {
            callId: String(call._id),
            sessionId: String(call.sessionId),
            call,
            timestamp: new Date(),
        });
        io.to(socket_1.socketRooms.user(String(call.receiverId))).emit(call_constants_1.CALL_SOCKET_EVENTS.MISSED, {
            callId: String(call._id),
            sessionId: String(call.sessionId),
            call,
            timestamp: new Date(),
        });
    }
    static async notifyIncoming(call) {
        await (0, notification_publisher_1.publishNotification)({
            userId: String(call.receiverId),
            type: call_constants_1.CALL_NOTIFICATION_TYPES.INCOMING_CALL,
            title: "Incoming call",
            message: "You have an incoming call in an active job session.",
            data: {
                callId: String(call._id),
                sessionId: String(call.sessionId),
                callerId: String(call.callerId),
            },
        });
    }
    static async notifyDeclined(call) {
        await (0, notification_publisher_1.publishNotification)({
            userId: String(call.callerId),
            type: call_constants_1.CALL_NOTIFICATION_TYPES.CALL_DECLINED,
            title: "Call declined",
            message: "Your call was declined.",
            data: {
                callId: String(call._id),
                sessionId: String(call.sessionId),
            },
        });
    }
    static async notifyMissed(call) {
        await (0, notification_publisher_1.publishNotification)({
            userId: String(call.callerId),
            type: call_constants_1.CALL_NOTIFICATION_TYPES.MISSED_CALL,
            title: "Missed call",
            message: "Your call was missed.",
            data: {
                callId: String(call._id),
                sessionId: String(call.sessionId),
            },
        });
    }
}
exports.CallEventService = CallEventService;
