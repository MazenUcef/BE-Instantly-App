import { randomUUID } from "crypto";
import { getChannel } from "../../shared/config/rabbitmq";

export const NOTIFICATION_QUEUE = "notifications" as const;

export interface NotificationPayload {
  userId: string;
  type: string;
  title: string;
  message: string;
  data?: Record<string, any> | null;
}

export interface NotificationQueueMessage extends NotificationPayload {
  messageId: string;
  version: number;
  createdAt: string;
}

const assertNotificationPayload = (payload: NotificationPayload) => {
  if (!payload.userId?.trim()) {
    throw new Error("Notification userId is required");
  }

  if (!payload.type?.trim()) {
    throw new Error("Notification type is required");
  }

  if (!payload.title?.trim()) {
    throw new Error("Notification title is required");
  }

  if (!payload.message?.trim()) {
    throw new Error("Notification message is required");
  }
};

export const publishNotification = async (
  payload: NotificationPayload,
): Promise<NotificationQueueMessage> => {
  assertNotificationPayload(payload);

  const channel = getChannel();

  if (!channel) {
    throw new Error("RabbitMQ channel is not initialized");
  }

  const message: NotificationQueueMessage = {
    userId: payload.userId,
    type: payload.type,
    title: payload.title,
    message: payload.message,
    data: payload.data ?? null,
    messageId: randomUUID(),
    version: 1,
    createdAt: new Date().toISOString(),
  };

  const sent = channel.sendToQueue(
    NOTIFICATION_QUEUE,
    Buffer.from(JSON.stringify(message)),
    {
      persistent: true,
      contentType: "application/json",
      contentEncoding: "utf-8",
      messageId: message.messageId,
      timestamp: Date.now(),
      type: message.type,
    },
  );

  if (!sent) {
    throw new Error("Failed to enqueue notification message");
  }

  return message;
};