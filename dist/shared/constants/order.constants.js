"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ACTIVE_ORDER_STATUSES = exports.ORDER_NOTIFICATION_TYPES = exports.ORDER_TYPE = exports.ORDER_STATUS = void 0;
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
exports.ORDER_NOTIFICATION_TYPES = {
    OFFER_REJECTED: "OFFER_REJECTED",
    ORDER_CREATED: "ORDER_CREATED",
    ORDER_DELETED: "ORDER_DELETED",
    REVIEW_REQUIRED: "REVIEW_REQUIRED",
};
exports.ACTIVE_ORDER_STATUSES = [
    exports.ORDER_STATUS.PENDING,
    exports.ORDER_STATUS.IN_PROGRESS,
];
