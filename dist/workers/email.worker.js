"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.startEmailWorker = void 0;
const rabbitmq_1 = require("../shared/config/rabbitmq");
const emailService_1 = require("../shared/utils/emailService");
const startEmailWorker = async () => {
    const channel = (0, rabbitmq_1.getChannel)();
    await channel.assertQueue("email_jobs", { durable: true });
    channel.consume("email_jobs", async (msg) => {
        if (!msg)
            return;
        const { type, to, data } = JSON.parse(msg.content.toString());
        try {
            switch (type) {
                case "welcome_email":
                    await (0, emailService_1.sendWelcomeEmail)(to, data.firstName);
                    break;
                case "reset_password_email":
                    await (0, emailService_1.sendResetPasswordEmail)(to, data.token);
                    break;
                case "password_reset_otp":
                    await (0, emailService_1.sendPasswordResetOTPEmail)(to, data.otp, data.firstName);
                    break;
                case "password_changed_email":
                    await (0, emailService_1.sendPasswordChangedEmail)(to);
                    break;
                case "otp_email":
                    await (0, emailService_1.sendEmailOTP)(to, data.otp);
                    break;
                default:
                    console.log("Unknown email type:", type);
            }
            channel.ack(msg);
        }
        catch (err) {
            console.error("Failed to process email job:", err);
            channel.nack(msg, false, true);
        }
    });
    console.log("✅ Email worker started, listening to 'email_jobs'");
};
exports.startEmailWorker = startEmailWorker;
