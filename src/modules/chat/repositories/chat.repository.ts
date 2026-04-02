import { ClientSession, Types } from "mongoose";
import MessageModel from "../models/chat.model";

export class ChatRepository {
  static createMessage(
    data: {
      sessionId: Types.ObjectId | string;
      senderId: Types.ObjectId | string;
      receiverId: Types.ObjectId | string;
      message: string;
      deliveredAt?: Date | null;
    },
    session?: ClientSession,
  ) {
    return MessageModel.create([data], { session }).then((docs) => docs[0]);
  }

  static findMessagesBySession(
    sessionId: Types.ObjectId | string,
    page = 1,
    limit = 50,
  ) {
    const skip = (page - 1) * limit;

    return MessageModel.find({ sessionId })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate("senderId", "firstName lastName profilePicture role")
      .populate("receiverId", "firstName lastName profilePicture role");
  }

  static countMessagesBySession(sessionId: Types.ObjectId | string) {
    return MessageModel.countDocuments({ sessionId });
  }

  static markSessionMessagesAsRead(
    sessionId: Types.ObjectId | string,
    receiverId: Types.ObjectId | string,
    session?: ClientSession,
  ) {
    return MessageModel.updateMany(
      {
        sessionId,
        receiverId,
        read: false,
      },
      {
        $set: {
          read: true,
          readAt: new Date(),
        },
      },
      { session },
    );
  }

  static countUnreadBySessionForUser(
    sessionId: Types.ObjectId | string,
    receiverId: Types.ObjectId | string,
  ) {
    return MessageModel.countDocuments({
      sessionId,
      receiverId,
      read: false,
    });
  }
}