"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ACTIVE_OFFER_STATUSES = exports.OFFER_NOTIFICATION_TYPES = exports.OFFER_STATUS = void 0;
exports.OFFER_STATUS = {
    PENDING: "pending",
    ACCEPTED: "accepted",
    REJECTED: "rejected",
    EXPIRED: "expired",
    COMPLETED: "completed",
    WITHDRAWN: "withdrawn",
};
exports.OFFER_NOTIFICATION_TYPES = {
    NEW_OFFER: "NEW_OFFER",
    OFFER_UPDATED: "OFFER_UPDATED",
    OFFER_ACCEPTED: "OFFER_ACCEPTED",
    OFFER_REJECTED: "OFFER_REJECTED",
    OFFER_WITHDRAWN: "OFFER_WITHDRAWN",
    ORDER_ACCEPTED_DIRECT: "ORDER_ACCEPTED_DIRECT",
    OFFERS_WITHDRAWN: "OFFERS_WITHDRAWN",
};
exports.ACTIVE_OFFER_STATUSES = [
    exports.OFFER_STATUS.PENDING,
    exports.OFFER_STATUS.ACCEPTED,
];
