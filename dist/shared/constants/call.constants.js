"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CALL_BLOCKED_SESSION_STATUSES = exports.CALL_NOTIFICATION_TYPES = exports.CALL_SOCKET_EVENTS = exports.FINAL_CALL_STATUSES = exports.ACTIVE_CALL_STATUSES = exports.CALL_END_REASON = exports.CALL_STATUS = exports.CALL_TYPE = void 0;
exports.CALL_TYPE = {
    AUDIO: "audio",
};
exports.CALL_STATUS = {
    INITIATED: "initiated",
    RINGING: "ringing",
    ACCEPTED: "accepted",
    DECLINED: "declined",
    MISSED: "missed",
    ENDED: "ended",
    FAILED: "failed",
};
exports.CALL_END_REASON = {
    CALLER_ENDED: "caller_ended",
    RECEIVER_ENDED: "receiver_ended",
    MISSED: "missed",
    DECLINED: "declined",
    FAILED: "failed",
    BUSY: "busy",
};
exports.ACTIVE_CALL_STATUSES = [
    exports.CALL_STATUS.INITIATED,
    exports.CALL_STATUS.RINGING,
    exports.CALL_STATUS.ACCEPTED,
];
exports.FINAL_CALL_STATUSES = [
    exports.CALL_STATUS.DECLINED,
    exports.CALL_STATUS.MISSED,
    exports.CALL_STATUS.ENDED,
    exports.CALL_STATUS.FAILED,
];
exports.CALL_SOCKET_EVENTS = {
    INCOMING: "call:incoming",
    RINGING: "call:ringing",
    ACCEPTED: "call:accepted",
    DECLINED: "call:declined",
    ENDED: "call:ended",
    MISSED: "call:missed",
    FAILED: "call:failed",
};
exports.CALL_NOTIFICATION_TYPES = {
    INCOMING_CALL: "INCOMING_CALL",
    CALL_DECLINED: "CALL_DECLINED",
    MISSED_CALL: "MISSED_CALL",
};
exports.CALL_BLOCKED_SESSION_STATUSES = [
    "completed",
    "cancelled",
];
