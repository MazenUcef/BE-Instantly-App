"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.NotificationRepository = void 0;
const notifications_model_1 = __importDefault(require("../models/notifications.model"));
class NotificationRepository {
    static createNotification(data, session) {
        return notifications_model_1.default.create([data], { session }).then((docs) => docs[0]);
    }
    static findById(notificationId, session) {
        return notifications_model_1.default.findById(notificationId).session(session || null);
    }
    static findByUserId(userId, page = 1, limit = 20) {
        const skip = (page - 1) * limit;
        return notifications_model_1.default.find({ userId })
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit);
    }
    static countByUserId(userId) {
        return notifications_model_1.default.countDocuments({ userId });
    }
    static countUnreadByUserId(userId) {
        return notifications_model_1.default.countDocuments({
            userId,
            isRead: false,
        });
    }
    static markAsRead(notificationId, userId, session) {
        return notifications_model_1.default.findOneAndUpdate({
            _id: notificationId,
            userId,
            isRead: false,
        }, {
            $set: {
                isRead: true,
                readAt: new Date(),
            },
        }, { new: true, session });
    }
    static markAllAsRead(userId, session) {
        return notifications_model_1.default.updateMany({
            userId,
            isRead: false,
        }, {
            $set: {
                isRead: true,
                readAt: new Date(),
            },
        }, { session });
    }
}
exports.NotificationRepository = NotificationRepository;
