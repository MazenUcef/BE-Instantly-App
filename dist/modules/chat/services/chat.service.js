"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ChatService = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const errorHandler_1 = require("../../../shared/middlewares/errorHandler");
const chat_repository_1 = require("../repositories/chat.repository");
const session_model_1 = __importDefault(require("../../session/models/session.model"));
const socket_1 = require("../../../shared/config/socket");
const chat_constants_1 = require("../../../shared/constants/chat.constants");
const normalizePaginatedMessages = (messages) => {
    return [...messages].reverse();
};
class ChatService {
    static async getAccessibleSession(sessionId, userId, dbSession) {
        const session = await session_model_1.default.findById(sessionId).session(dbSession || null);
        if (!session) {
            throw new errorHandler_1.AppError("Session not found", 404);
        }
        if (chat_constants_1.CHAT_SESSION_BLOCKED_STATUSES.includes(session.status)) {
            throw new errorHandler_1.AppError("Chat is closed. Session already completed or cancelled.", 403);
        }
        const isParticipant = session.customerId.toString() === userId ||
            session.supplierId.toString() === userId;
        if (!isParticipant) {
            throw new errorHandler_1.AppError("Not allowed in this chat", 403);
        }
        return session;
    }
    static async sendMessage(input) {
        const { senderId, sessionId, message } = input;
        const dbSession = await mongoose_1.default.startSession();
        let createdMessage = null;
        let receiverId = null;
        try {
            await dbSession.withTransaction(async () => {
                const session = await this.getAccessibleSession(sessionId, senderId, dbSession);
                receiverId =
                    senderId === session.customerId.toString()
                        ? session.supplierId.toString()
                        : session.customerId.toString();
                createdMessage = await chat_repository_1.ChatRepository.createMessage({
                    sessionId,
                    senderId,
                    receiverId,
                    message: message.trim(),
                    deliveredAt: new Date(),
                }, dbSession);
            });
        }
        finally {
            await dbSession.endSession();
        }
        const io = (0, socket_1.getIO)();
        const payload = {
            message: createdMessage,
            sessionId,
        };
        io.to(socket_1.socketRooms.chat(sessionId)).emit(socket_1.socketEvents.MESSAGE_NEW, payload);
        io.to(socket_1.socketRooms.user(receiverId)).emit(socket_1.socketEvents.MESSAGE_NEW, payload);
        io.to(socket_1.socketRooms.user(senderId)).emit(socket_1.socketEvents.MESSAGE_NEW, payload);
        return {
            success: true,
            message: "Message sent successfully",
            data: createdMessage,
        };
    }
    static async getMessagesBySession(input) {
        const { userId, sessionId, page = 1, limit = 50 } = input;
        await this.getAccessibleSession(sessionId, userId);
        const [messages, total] = await Promise.all([
            chat_repository_1.ChatRepository.findMessagesBySession(sessionId, page, limit),
            chat_repository_1.ChatRepository.countMessagesBySession(sessionId),
        ]);
        return {
            success: true,
            count: messages.length,
            total,
            page,
            limit,
            messages: normalizePaginatedMessages(messages),
        };
    }
    static async markMessagesAsRead(input) {
        const { userId, sessionId } = input;
        await this.getAccessibleSession(sessionId, userId);
        await chat_repository_1.ChatRepository.markSessionMessagesAsRead(sessionId, userId);
        const unreadCount = await chat_repository_1.ChatRepository.countUnreadBySessionForUser(sessionId, userId);
        const io = (0, socket_1.getIO)();
        io.to(socket_1.socketRooms.chat(sessionId)).emit(socket_1.socketEvents.MESSAGE_READ, {
            sessionId,
            userId,
            unreadCount,
            timestamp: new Date(),
        });
        return {
            success: true,
            message: "Messages marked as read",
            unreadCount,
        };
    }
}
exports.ChatService = ChatService;
