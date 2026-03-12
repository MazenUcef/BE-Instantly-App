"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getMessagesBySession = exports.sendMessage = void 0;
const Message_model_1 = __importDefault(require("../models/Message.model"));
const socket_1 = require("../../../shared/config/socket");
const session_model_1 = __importDefault(require("../../session/models/session.model"));
const sendMessage = async (req, res) => {
    try {
        const { sessionId, message } = req.body;
        const senderId = req.user.userId;
        const session = await session_model_1.default.findById(sessionId);
        if (!session) {
            return res.status(404).json({ message: "Session not found" });
        }
        if (["completed", "cancelled"].includes(session.status)) {
            return res.status(403).json({
                message: "Chat is closed. Session already completed.",
            });
        }
        if (session.customerId.toString() !== senderId &&
            session.supplierId.toString() !== senderId) {
            return res.status(403).json({ message: "Not allowed in this chat" });
        }
        const receiverId = senderId === session.customerId.toString()
            ? session.supplierId.toString()
            : session.customerId.toString();
        const newMessage = await Message_model_1.default.create({
            sessionId,
            senderId,
            receiverId,
            message,
        });
        const io = (0, socket_1.getIO)();
        io.to(`chat_${sessionId}`).emit("receive_message", newMessage);
        res.status(201).json(newMessage);
    }
    catch (error) {
        console.error("Send message error:", error);
        res.status(500).json({ message: "Failed to send message" });
    }
};
exports.sendMessage = sendMessage;
const getMessagesBySession = async (req, res) => {
    try {
        const { sessionId } = req.params;
        const userId = req.user.userId;
        const session = await session_model_1.default.findById(sessionId);
        if (!session) {
            return res.status(404).json({ message: "Session not found" });
        }
        if (["completed", "cancelled"].includes(session.status)) {
            return res.status(403).json({
                message: "Chat is closed. Session completed.",
            });
        }
        if (session.customerId.toString() !== userId &&
            session.supplierId.toString() !== userId) {
            return res.status(403).json({ message: "Not allowed" });
        }
        const messages = await Message_model_1.default.find({ sessionId }).sort({
            createdAt: 1,
        });
        res.json({ count: messages.length, messages });
    }
    catch (error) {
        res.status(500).json({ message: "Failed to fetch messages" });
    }
};
exports.getMessagesBySession = getMessagesBySession;
