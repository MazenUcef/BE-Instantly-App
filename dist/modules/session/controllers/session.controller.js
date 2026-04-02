"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getResumeSessionForUser = exports.confirmSessionPayment = exports.getSessionByOrder = exports.completeSession = exports.updateSessionStatus = exports.getActiveSessionForUser = exports.getSessionById = exports.createSession = void 0;
const session_service_1 = require("../services/session.service");
const createSession = async (req, res) => {
    const result = await session_service_1.SessionService.createSession({
        orderId: req.body.orderId,
        offerId: req.body.offerId,
        customerId: req.body.customerId,
        supplierId: req.body.supplierId,
    });
    return res.status(201).json(result);
};
exports.createSession = createSession;
const getSessionById = async (req, res) => {
    const result = await session_service_1.SessionService.getSessionById({
        sessionId: req.params.id,
        userId: req.user.userId,
    });
    return res.status(200).json(result);
};
exports.getSessionById = getSessionById;
const getActiveSessionForUser = async (req, res) => {
    const result = await session_service_1.SessionService.getActiveSessionForUser({
        requestedUserId: req.params.userId,
        actorUserId: req.user.userId,
    });
    return res.status(200).json(result);
};
exports.getActiveSessionForUser = getActiveSessionForUser;
const updateSessionStatus = async (req, res) => {
    const result = await session_service_1.SessionService.updateSessionStatus({
        sessionId: req.params.id,
        actorUserId: req.user.userId,
        nextStatus: req.body.status,
        reason: req.body.reason,
    });
    return res.status(200).json(result);
};
exports.updateSessionStatus = updateSessionStatus;
const completeSession = async (req, res) => {
    const result = await session_service_1.SessionService.completeSession({
        sessionId: req.params.id,
        actorUserId: req.user.userId,
    });
    return res.status(200).json(result);
};
exports.completeSession = completeSession;
const getSessionByOrder = async (req, res) => {
    const result = await session_service_1.SessionService.getSessionByOrder({
        orderId: req.params.orderId,
        userId: req.user.userId,
    });
    return res.status(200).json(result);
};
exports.getSessionByOrder = getSessionByOrder;
const confirmSessionPayment = async (req, res) => {
    const result = await session_service_1.SessionService.confirmSessionPayment({
        sessionId: req.params.sessionId,
        userId: req.user.userId,
        userRole: req.user.role,
    });
    return res.status(200).json(result);
};
exports.confirmSessionPayment = confirmSessionPayment;
const getResumeSessionForUser = async (req, res) => {
    const result = await session_service_1.SessionService.getResumeSessionForUser({
        requestedUserId: req.params.userId,
        actorUserId: req.user.userId,
    });
    return res.status(200).json(result);
};
exports.getResumeSessionForUser = getResumeSessionForUser;
