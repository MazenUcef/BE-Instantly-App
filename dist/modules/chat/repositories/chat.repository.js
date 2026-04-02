"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ChatRepository = void 0;
const chat_model_1 = __importDefault(require("../models/chat.model"));
class ChatRepository {
    static createMessage(data, session) {
        return chat_model_1.default.create([data], { session }).then((docs) => docs[0]);
    }
    static findMessagesBySession(sessionId, page = 1, limit = 50) {
        const skip = (page - 1) * limit;
        return chat_model_1.default.find({ sessionId })
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .populate("senderId", "firstName lastName profilePicture role")
            .populate("receiverId", "firstName lastName profilePicture role");
    }
    static countMessagesBySession(sessionId) {
        return chat_model_1.default.countDocuments({ sessionId });
    }
    static markSessionMessagesAsRead(sessionId, receiverId, session) {
        return chat_model_1.default.updateMany({
            sessionId,
            receiverId,
            read: false,
        }, {
            $set: {
                read: true,
                readAt: new Date(),
            },
        }, { session });
    }
    static countUnreadBySessionForUser(sessionId, receiverId) {
        return chat_model_1.default.countDocuments({
            sessionId,
            receiverId,
            read: false,
        });
    }
}
exports.ChatRepository = ChatRepository;
