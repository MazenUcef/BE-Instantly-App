import { getChannel } from "../shared/config/rabbitmq";
import { getIO } from "../shared/config/socket";
import prisma from "../shared/config/prisma";
import { Prisma } from "@prisma/client";
import { NotificationPayload } from "../modules/notification/notification.publisher";

export const startNotificationWorker = async () => {
  const channel = getChannel();

  await channel.assertQueue("notifications", { durable: true });

  channel.consume("notifications", async (msg) => {
    if (!msg) return;

    const payload: NotificationPayload = JSON.parse(msg.content.toString());

    try {
      const user = await prisma.user.findUnique({ where: { id: payload.userId }, select: { id: true } });
      if (!user) {
        console.warn(`Notification worker: user ${payload.userId} not found, discarding message`);
        channel.ack(msg);
        return;
      }

      const notification = await prisma.notification.create({
        data: {
          userId: payload.userId,
          type: payload.type,
          title: payload.title,
          message: payload.message,
          data: (payload.data ?? Prisma.JsonNull) as Prisma.InputJsonValue,
        },
      });

      const io = getIO();
      io.to(`user_${payload.userId}`).emit("new_notification", notification);

      channel.ack(msg);
    } catch (err: any) {
      console.error("Notification worker error:", err);
      const isUnrecoverable = err?.code === "P2003" || err?.code === "P2025";
      if (isUnrecoverable) {
        console.warn("Notification worker: unrecoverable error, discarding message");
        channel.ack(msg);
      } else {
        channel.nack(msg, false, true);
      }
    }
  });
  console.log("✅ Notification worker started, listening to 'notifications'");
};
