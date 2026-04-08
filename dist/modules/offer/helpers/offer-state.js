"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.canCustomerRejectOffer = exports.canCustomerAcceptOffer = exports.canSupplierWithdrawOffer = exports.isOfferTerminal = exports.assertValidOfferTransition = void 0;
const offer_constants_1 = require("../../../shared/constants/offer.constants");
const errorHandler_1 = require("../../../shared/middlewares/errorHandler");
const assertValidOfferTransition = (currentStatus, nextStatus) => {
    const allowed = offer_constants_1.OFFER_TRANSITIONS[currentStatus] || [];
    if (!allowed.includes(nextStatus)) {
        throw new errorHandler_1.AppError(`Invalid offer status transition from "${currentStatus}" to "${nextStatus}"`, 400);
    }
};
exports.assertValidOfferTransition = assertValidOfferTransition;
const isOfferTerminal = (status) => {
    return offer_constants_1.OFFER_TERMINAL_STATUSES.includes(status);
};
exports.isOfferTerminal = isOfferTerminal;
const canSupplierWithdrawOffer = (status) => {
    return (status === offer_constants_1.OFFER_STATUS.PENDING || status === offer_constants_1.OFFER_STATUS.ACCEPTED);
};
exports.canSupplierWithdrawOffer = canSupplierWithdrawOffer;
const canCustomerAcceptOffer = (status) => {
    return status === offer_constants_1.OFFER_STATUS.PENDING;
};
exports.canCustomerAcceptOffer = canCustomerAcceptOffer;
const canCustomerRejectOffer = (status) => {
    return status === offer_constants_1.OFFER_STATUS.PENDING;
};
exports.canCustomerRejectOffer = canCustomerRejectOffer;
