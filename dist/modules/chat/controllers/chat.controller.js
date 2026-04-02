"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.markMessagesAsRead = exports.getMessagesBySession = exports.sendMessage = void 0;
const chat_service_1 = require("../services/chat.service");
const sendMessage = async (req, res) => {
    const result = await chat_service_1.ChatService.sendMessage({
        senderId: req.user.userId,
        sessionId: req.body.sessionId,
        message: req.body.message,
    });
    return res.status(201).json(result);
};
exports.sendMessage = sendMessage;
const getMessagesBySession = async (req, res) => {
    const result = await chat_service_1.ChatService.getMessagesBySession({
        userId: req.user.userId,
        sessionId: req.params.sessionId,
        page: Number(req.query.page || 1),
        limit: Number(req.query.limit || 50),
    });
    return res.status(200).json(result);
};
exports.getMessagesBySession = getMessagesBySession;
const markMessagesAsRead = async (req, res) => {
    const result = await chat_service_1.ChatService.markMessagesAsRead({
        userId: req.user.userId,
        sessionId: req.params.sessionId,
    });
    return res.status(200).json(result);
};
exports.markMessagesAsRead = markMessagesAsRead;
