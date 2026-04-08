"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.canCancelSession = exports.canCompleteSession = exports.canConfirmSessionPayment = exports.isSessionTerminal = exports.assertValidSessionTransition = void 0;
const session_constants_1 = require("../../../shared/constants/session.constants");
const errorHandler_1 = require("../../../shared/middlewares/errorHandler");
const buildFullFlow = (workflowSteps) => [
    session_constants_1.SESSION_STATUS.STARTED,
    ...workflowSteps,
    session_constants_1.SESSION_STATUS.COMPLETED,
];
const assertValidSessionTransition = (workflowSteps, currentStatus, nextStatus) => {
    const fullFlow = buildFullFlow(workflowSteps);
    const currentIndex = fullFlow.indexOf(currentStatus);
    if (currentIndex === -1) {
        throw new errorHandler_1.AppError(`Unknown current status "${currentStatus}"`, 400);
    }
    const expectedNext = fullFlow[currentIndex + 1];
    if (expectedNext !== nextStatus) {
        throw new errorHandler_1.AppError(`Invalid session status transition from "${currentStatus}" to "${nextStatus}". Expected "${expectedNext}"`, 400);
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
const canCompleteSession = (session) => {
    const lastStep = session.workflowSteps[session.workflowSteps.length - 1] ??
        session_constants_1.SESSION_STATUS.STARTED;
    return session.status === lastStep;
};
exports.canCompleteSession = canCompleteSession;
const canCancelSession = (status) => {
    return !(0, exports.isSessionTerminal)(status);
};
exports.canCancelSession = canCancelSession;
