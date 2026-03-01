import { getChannel } from "../shared/config/rabbitmq";
import { getIO } from "../shared/config/socket";
import notificationsModel from "../modules/notification/models/notifications.model";

export const startNotificationWorker = async () => {
  const channel = getChannel();

  channel.consume("notifications", async (msg) => {
    if (!msg) return;
    const payload = JSON.parse(msg.content.toString());

    try {
      const notification = await notificationsModel.create(payload);
      const io = getIO();
      io.to(`user_${payload.userId}`).emit("new_notification", notification);
      channel.ack(msg);
    } catch (err) {
      console.error("Notification worker error:", err);
    }
  });

  console.log("🚀 Notification worker running...");
};