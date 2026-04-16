import { Prisma } from "@prisma/client";
import prisma from "../../../shared/config/prisma";

type Tx = Prisma.TransactionClient;

const userSelect = {
  id: true,
  firstName: true,
  lastName: true,
  profilePicture: true,
  role: true,
} as const;

export class ChatRepository {
  static createMessage(
    data: {
      sessionId: string;
      senderId: string;
      receiverId: string;
      message: string;
      deliveredAt?: Date | null;
    },
    tx?: Tx,
  ) {
    return (tx ?? prisma).message.create({
      data: {
        sessionId: data.sessionId,
        senderId: data.senderId,
        receiverId: data.receiverId,
        message: data.message,
        deliveredAt: data.deliveredAt ?? null,
      },
    });
  }

  static findMessagesBySession(sessionId: string, page = 1, limit = 50) {
    const skip = (page - 1) * limit;
    return prisma.message.findMany({
      where: { sessionId },
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
      include: {
        sender: { select: userSelect },
        receiver: { select: userSelect },
      },
    });
  }

  static countMessagesBySession(sessionId: string) {
    return prisma.message.count({ where: { sessionId } });
  }

  static markSessionMessagesAsRead(
    sessionId: string,
    receiverId: string,
    tx?: Tx,
  ) {
    return (tx ?? prisma).message.updateMany({
      where: { sessionId, receiverId, read: false },
      data: { read: true, readAt: new Date() },
    });
  }

  static countUnreadBySessionForUser(sessionId: string, receiverId: string) {
    return prisma.message.count({
      where: { sessionId, receiverId, read: false },
    });
  }
}
