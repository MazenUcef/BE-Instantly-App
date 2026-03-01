import redis from '../config/redis';

export const generateOTP = (): string =>
  Math.floor(100000 + Math.random() * 900000).toString();

export const savePhoneOTP = async (phone: string, otp: string) => {
  await redis.set(`otp:phone:${phone}`, otp, 'EX', 300);
};

export const saveEmailOTP = async (email: string, otp: string) => {
  await redis.set(`otp:email:${email}`, otp, 'EX', 300);
};

export const verifyPhoneOTPUtil = async (phone: string, otp: string) => {
  const saved = await redis.get(`otp:phone:${phone}`);
  return saved === otp;
};

export const verifyEmailOTPUtil = async (email: string, otp: string) => {
  const saved = await redis.get(`otp:email:${email}`);
  console.log("saved" , saved);
  
  return saved === otp;
};
