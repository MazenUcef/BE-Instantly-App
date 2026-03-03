import { getChannel } from "../shared/config/rabbitmq";
import {
  sendEmailOTP,
  sendPasswordChangedEmail,
  sendPasswordResetOTPEmail,
  sendResetPasswordEmail,
  sendWelcomeEmail,
} from "../shared/utils/emailService";

export const startEmailWorker = async () => {
  const channel = getChannel();

  await channel.assertQueue("email_jobs", { durable: true });

  channel.consume("email_jobs", async (msg) => {
    if (!msg) return;

    const { type, to, data } = JSON.parse(msg.content.toString());

    try {
      switch (type) {
        case "welcome_email":
          await sendWelcomeEmail(to, data.firstName);
          break;
        case "reset_password_email":
          await sendResetPasswordEmail(to, data.token);
          break;
        case "password_reset_otp":
          await sendPasswordResetOTPEmail(to, data.otp, data.firstName);
          break;
        case "password_changed_email":
          await sendPasswordChangedEmail(to);
          break;
        case "otp_email":
          await sendEmailOTP(to, data.otp);
          break;
        default:
          console.log("Unknown email type:", type);
      }

      channel.ack(msg);
    } catch (err) {
      console.error("Failed to process email job:", err);
      channel.nack(msg, false, true);
    }
  });

  console.log("✅ Email worker started, listening to 'email_jobs'");
};
