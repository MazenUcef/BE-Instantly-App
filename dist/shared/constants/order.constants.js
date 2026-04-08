"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ORDER_NOTIFICATION_TYPES = exports.ORDER_TRANSITIONS = exports.ORDER_TERMINAL_STATUSES = exports.ORDER_ACTIVE_STATUSES = exports.ORDER_CANCELLED_BY = exports.ORDER_TYPE = exports.ORDER_STATUS = void 0;
exports.ORDER_STATUS = {
    PENDING: "pending",
    IN_PROGRESS: "in_progress",
    COMPLETED: "completed",
    CANCELLED: "cancelled",
};
exports.ORDER_TYPE = {
    CONTRACT: "contract",
    DAILY: "daily",
};
exports.ORDER_CANCELLED_BY = {
    CUSTOMER: "customer",
    SUPPLIER: "supplier",
    SYSTEM: "system",
    ADMIN: "admin",
};
exports.ORDER_ACTIVE_STATUSES = [
    exports.ORDER_STATUS.PENDING,
    exports.ORDER_STATUS.IN_PROGRESS,
];
exports.ORDER_TERMINAL_STATUSES = [
    exports.ORDER_STATUS.COMPLETED,
    exports.ORDER_STATUS.CANCELLED,
];
exports.ORDER_TRANSITIONS = {
    [exports.ORDER_STATUS.PENDING]: [
        exports.ORDER_STATUS.IN_PROGRESS,
        exports.ORDER_STATUS.CANCELLED,
    ],
    [exports.ORDER_STATUS.IN_PROGRESS]: [
        exports.ORDER_STATUS.COMPLETED,
        exports.ORDER_STATUS.CANCELLED,
    ],
    [exports.ORDER_STATUS.COMPLETED]: [],
    [exports.ORDER_STATUS.CANCELLED]: [],
};
exports.ORDER_NOTIFICATION_TYPES = {
    OFFER_REJECTED: "OFFER_REJECTED",
    ORDER_CREATED: "ORDER_CREATED",
    ORDER_CANCELLED: "ORDER_CANCELLED",
    REVIEW_REQUIRED: "REVIEW_REQUIRED",
};
