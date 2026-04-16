import { getChannel } from "../shared/config/rabbitmq";
import { publishNotification } from "../modules/notification/notification.publisher";
import { sendEmailOTP } from "../shared/utils/emailService";

export const startUserWorker = async () => {
  const channel = getChannel();

  await channel.assertQueue("USER_REGISTERED", { durable: true });

  channel.consume("USER_REGISTERED", async (msg) => {
    if (!msg) return;

    const data = JSON.parse(msg.content.toString());

    try {
      await sendEmailOTP(data.email, data.otp);
      console.log("Email sent to:", data.email);

      await publishNotification({
        userId: data.userId,
        type: "welcome",
        title: "Welcome 🎉",
        message: `Hi ${data.firstName}, thanks for joining!`,
      });

      channel.ack(msg);
    } catch (err) {
      console.error("Error processing USER_REGISTERED", err);
      channel.nack(msg, false, true);
    }
  });

  console.log("✅ User worker started, listening to 'USER_REGISTERED'");
};
