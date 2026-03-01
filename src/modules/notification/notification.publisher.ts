import { getChannel } from "../../shared/config/rabbitmq";


interface NotificationPayload {
  userId: string;
  type: string;
  title: string;
  message: string;
  data?: any;
}

export const publishNotification = async (
  payload: NotificationPayload
) => {
  const channel = getChannel();

  channel.sendToQueue(
    "notifications",
    Buffer.from(JSON.stringify(payload)),
    { persistent: true }
  );
};