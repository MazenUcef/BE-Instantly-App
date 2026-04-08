"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getIceConfig = exports.getSessionCallHistory = exports.markMissedCall = exports.endCall = exports.declineCall = exports.acceptCall = exports.startCall = void 0;
const call_service_1 = require("../services/call.service");
const startCall = async (req, res) => {
    const result = await call_service_1.CallService.startCall({
        sessionId: req.body.sessionId,
        callerId: req.user.userId,
    });
    return res.status(201).json(result);
};
exports.startCall = startCall;
const acceptCall = async (req, res) => {
    const result = await call_service_1.CallService.acceptCall({
        callId: req.params.id,
        userId: req.user.userId,
    });
    return res.status(200).json(result);
};
exports.acceptCall = acceptCall;
const declineCall = async (req, res) => {
    const result = await call_service_1.CallService.declineCall({
        callId: req.params.id,
        userId: req.user.userId,
    });
    return res.status(200).json(result);
};
exports.declineCall = declineCall;
const endCall = async (req, res) => {
    const result = await call_service_1.CallService.endCall({
        callId: req.params.id,
        userId: req.user.userId,
    });
    return res.status(200).json(result);
};
exports.endCall = endCall;
const markMissedCall = async (req, res) => {
    const result = await call_service_1.CallService.markMissedCall({
        callId: req.params.id,
        userId: req.user.userId,
    });
    return res.status(200).json(result);
};
exports.markMissedCall = markMissedCall;
const getSessionCallHistory = async (req, res) => {
    const result = await call_service_1.CallService.getSessionCallHistory({
        sessionId: req.params.sessionId,
        userId: req.user.userId,
    });
    return res.status(200).json(result);
};
exports.getSessionCallHistory = getSessionCallHistory;
const getIceConfig = async (_req, res) => {
    const result = await call_service_1.CallService.getIceConfig();
    return res.status(200).json(result);
};
exports.getIceConfig = getIceConfig;
