"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.verifyEmailOTPUtil = exports.verifyPhoneOTPUtil = exports.saveEmailOTP = exports.savePhoneOTP = exports.generateOTP = void 0;
const redis_1 = __importDefault(require("../config/redis"));
const generateOTP = () => Math.floor(100000 + Math.random() * 900000).toString();
exports.generateOTP = generateOTP;
const savePhoneOTP = async (phone, otp) => {
    await redis_1.default.set(`otp:phone:${phone}`, otp, 'EX', 300);
};
exports.savePhoneOTP = savePhoneOTP;
const saveEmailOTP = async (email, otp) => {
    await redis_1.default.set(`otp:email:${email}`, otp, 'EX', 300);
};
exports.saveEmailOTP = saveEmailOTP;
const verifyPhoneOTPUtil = async (phone, otp) => {
    const saved = await redis_1.default.get(`otp:phone:${phone}`);
    return saved === otp;
};
exports.verifyPhoneOTPUtil = verifyPhoneOTPUtil;
const verifyEmailOTPUtil = async (email, otp) => {
    const saved = await redis_1.default.get(`otp:email:${email}`);
    console.log("saved", saved);
    return saved === otp;
};
exports.verifyEmailOTPUtil = verifyEmailOTPUtil;
