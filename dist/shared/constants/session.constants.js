"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SESSION_NOTIFICATION_TYPES = exports.SESSION_RESUME_ACTION = exports.SESSION_CANCELLED_BY = exports.SESSION_TERMINAL_STATUSES = exports.SESSION_STATUS = void 0;
exports.SESSION_STATUS = {
    STARTED: "started",
    COMPLETED: "completed",
    CANCELLED: "cancelled",
};
exports.SESSION_TERMINAL_STATUSES = [
    exports.SESSION_STATUS.COMPLETED,
    exports.SESSION_STATUS.CANCELLED,
];
exports.SESSION_CANCELLED_BY = {
    CUSTOMER: "customer",
    SUPPLIER: "supplier",
    SYSTEM: "system",
    ADMIN: "admin",
};
exports.SESSION_RESUME_ACTION = {
    NONE: "none",
    JOB_SESSION: "job_session",
    REVIEW: "review",
    PAYMENT_CONFIRMATION: "payment_confirmation",
};
exports.SESSION_NOTIFICATION_TYPES = {
    SESSION_CREATED: "SESSION_CREATED",
    SESSION_CANCELLED: "SESSION_CANCELLED",
    SESSION_COMPLETED: "SESSION_COMPLETED",
    SESSION_PAYMENT_CONFIRMED: "SESSION_PAYMENT_CONFIRMED",
    SUPPLIER_STATUS_UPDATE: "SUPPLIER_STATUS_UPDATE",
};
