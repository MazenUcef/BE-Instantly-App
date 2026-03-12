"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendOTP = void 0;
const twilio_1 = __importDefault(require("twilio"));
const client = (0, twilio_1.default)(process.env.TWILIO_SID, process.env.TWILIO_AUTH_TOKEN);
const sendOTP = async (phone, otp) => {
    await client.messages.create({
        body: `Your verification code is ${otp}`,
        from: process.env.TWILIO_PHONE,
        to: phone,
    });
};
exports.sendOTP = sendOTP;
