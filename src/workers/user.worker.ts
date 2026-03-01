import { publishNotification } from "../modules/notification/notification.publisher";
import { connectRabbitMQ } from "../shared/config/rabbitmq";
import { sendEmailOTP } from "../shared/utils/emailService";

export const startUserWorker = async () => {
  const { channel } = await connectRabbitMQ();
  channel.consume("USER_REGISTERED", async (msg) => {
    if (!msg) {
      console.log("No message received");
      return;
    }
    console.log(
      "Worker received USER_REGISTERED message:",
      msg.content.toString(),
    );

    const data = JSON.parse(msg.content.toString());
    console.log("Parsed data:", data);

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
    }
  });

  console.log("🚀 User worker running, waiting for messages...");
};
