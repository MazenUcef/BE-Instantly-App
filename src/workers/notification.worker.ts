import { getChannel } from "../shared/config/rabbitmq";
import { getIO } from "../shared/config/socket";
import notificationsModel from "../modules/notification/models/notifications.model";
import { NotificationPayload } from "../modules/notification/notification.publisher";

export const startNotificationWorker = async () => {
  const channel = getChannel();

  await channel.assertQueue("notifications", { durable: true });

  channel.consume("notifications", async (msg) => {
    if (!msg) return;

    const payload: NotificationPayload = JSON.parse(msg.content.toString());

    try {
      const notification = await notificationsModel.create(payload);

      const io = getIO(); 
      io.to(`user_${payload.userId}`).emit("new_notification", notification);

      channel.ack(msg);
    } catch (err) {
      console.error("Notification worker error:", err);
      channel.nack(msg, false, true);
    }
  });
  console.log("✅ Notification worker started, listening to 'notifications'");
};
