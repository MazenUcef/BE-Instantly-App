import prisma from "../../../shared/config/prisma";
import { Prisma, SessionStatus } from "@prisma/client";
import { AppError } from "../../../shared/middlewares/errorHandler";
import { ChatRepository } from "../repositories/chat.repository";
import { getIO, socketEvents, socketRooms } from "../../../shared/config/socket";
import { CHAT_SESSION_BLOCKED_STATUSES } from "../../../shared/constants/chat.constants";

const normalizePaginatedMessages = (messages: any[]) => [...messages].reverse();

type Tx = Prisma.TransactionClient;

export class ChatService {
  private static async getAccessibleSession(
    sessionId: string,
    userId: string,
    tx?: Tx,
  ) {
    const session = await (tx ?? prisma).jobSession.findUnique({
      where: { id: sessionId },
    });

    if (!session) throw new AppError("Session not found", 404);

    if ((CHAT_SESSION_BLOCKED_STATUSES as readonly string[]).includes(session.status)) {
      throw new AppError(
        "Chat is closed. Session already completed or cancelled.",
        403,
      );
    }

    const isParticipant =
      session.customerId === userId || session.supplierId === userId;
    if (!isParticipant) throw new AppError("Not allowed in this chat", 403);

    return session;
  }

  static async sendMessage(input: {
    senderId: string;
    sessionId: string;
    message: string;
  }) {
    const { senderId, sessionId, message } = input;

    const { createdMessage, receiverId } = await prisma.$transaction(
      async (tx) => {
        const session = await this.getAccessibleSession(sessionId, senderId, tx);
        const receiverId =
          senderId === session.customerId ? session.supplierId : session.customerId;

        const createdMessage = await ChatRepository.createMessage(
          {
            sessionId,
            senderId,
            receiverId,
            message: message.trim(),
            deliveredAt: new Date(),
          },
          tx,
        );
        return { createdMessage, receiverId };
      },
    );

    const io = getIO();
    const payload = { message: createdMessage, sessionId };
    io.to(socketRooms.chat(sessionId)).emit(socketEvents.MESSAGE_NEW, payload);
    io.to(socketRooms.user(receiverId)).emit(socketEvents.MESSAGE_NEW, payload);
    io.to(socketRooms.user(senderId)).emit(socketEvents.MESSAGE_NEW, payload);

    return {
      success: true,
      message: "Message sent successfully",
      data: createdMessage,
    };
  }

  static async getMessagesBySession(input: {
    userId: string;
    sessionId: string;
    page?: number;
    limit?: number;
  }) {
    const { userId, sessionId, page = 1, limit = 50 } = input;

    await this.getAccessibleSession(sessionId, userId);

    const [messages, total] = await Promise.all([
      ChatRepository.findMessagesBySession(sessionId, page, limit),
      ChatRepository.countMessagesBySession(sessionId),
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

  static async markMessagesAsRead(input: { userId: string; sessionId: string }) {
    const { userId, sessionId } = input;

    await this.getAccessibleSession(sessionId, userId);
    await ChatRepository.markSessionMessagesAsRead(sessionId, userId);

    const unreadCount = await ChatRepository.countUnreadBySessionForUser(
      sessionId,
      userId,
    );

    const io = getIO();
    io.to(socketRooms.chat(sessionId)).emit(socketEvents.MESSAGE_READ, {
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
