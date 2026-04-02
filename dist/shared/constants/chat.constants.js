"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CHAT_SOCKET_EVENTS = exports.CHAT_SESSION_BLOCKED_STATUSES = void 0;
exports.CHAT_SESSION_BLOCKED_STATUSES = ["completed", "cancelled"];
exports.CHAT_SOCKET_EVENTS = {
    MESSAGE_NEW: "message:new",
    MESSAGE_READ: "message:read",
    CHAT_SYNC: "chat:sync",
};
