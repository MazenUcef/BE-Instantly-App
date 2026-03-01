import twilio from 'twilio';

const client = twilio(
  process.env.TWILIO_SID,
  process.env.TWILIO_AUTH_TOKEN
);

export const sendOTP = async (phone: string, otp: string) => {
  await client.messages.create({
    body: `Your verification code is ${otp}`,
    from: process.env.TWILIO_PHONE,
    to: phone,
  });
};
