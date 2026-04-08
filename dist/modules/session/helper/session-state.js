"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.canCancelSession = exports.canCompleteSession = exports.canConfirmSessionPayment = exports.isSessionTerminal = exports.assertValidSessionTransition = void 0;
const session_constants_1 = require("../../../shared/constants/session.constants");
const errorHandler_1 = require("../../../shared/middlewares/errorHandler");
const assertValidSessionTransition = (currentStatus, nextStatus) => {
    const allowed = session_constants_1.SESSION_PROGRESS_TRANSITIONS[currentStatus] || [];
    if (!allowed.includes(nextStatus)) {
        throw new errorHandler_1.AppError(`Invalid session status transition from "${currentStatus}" to "${nextStatus}"`, 400);
    }
};
exports.assertValidSessionTransition = assertValidSessionTransition;
const isSessionTerminal = (status) => {
    return session_constants_1.SESSION_TERMINAL_STATUSES.includes(status);
};
exports.isSessionTerminal = isSessionTerminal;
const canConfirmSessionPayment = (status) => {
    return status === session_constants_1.SESSION_STATUS.COMPLETED;
};
exports.canConfirmSessionPayment = canConfirmSessionPayment;
const canCompleteSession = (status) => {
    return status === session_constants_1.SESSION_STATUS.WORK_STARTED;
};
exports.canCompleteSession = canCompleteSession;
const canCancelSession = (status) => {
    return [
        session_constants_1.SESSION_STATUS.STARTED,
        session_constants_1.SESSION_STATUS.ON_THE_WAY,
        session_constants_1.SESSION_STATUS.ARRIVED,
        session_constants_1.SESSION_STATUS.WORK_STARTED,
    ].includes(status);
};
exports.canCancelSession = canCancelSession;
