"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendEmailOTP = exports.sendWelcomeEmail = exports.sendVerificationEmail = exports.sendPasswordResetOTPEmail = exports.sendPasswordChangedEmail = exports.sendResetPasswordEmail = void 0;
const nodemailer_1 = __importDefault(require("nodemailer"));
// const transporter = nodemailer.createTransport({
//     host: 'smtp.sendgrid.net',
//     port: 587,
//     secure: false,
//     auth: {
//         user: 'apikey',
//         pass: process.env.SENDGRID_API_KEY
//     }
// });
const transporter = nodemailer_1.default.createTransport({
    service: 'gmail',
    auth: {
        user: 'mazenafifi1999@gmail.com',
        pass: 'ybcs slyz uawy flpm'
    }
});
const sendResetPasswordEmail = async (email, resetToken) => {
    const resetUrl = `${process.env.CLIENT_URL}/reset-password?token=${resetToken}`;
    console.log("resetToken", resetToken);
    const mailOptions = {
        from: process.env.FROM_USER,
        to: email,
        subject: 'Password Reset Request',
        html: `
      <h1>Password Reset Request</h1>
      <p>You requested to reset your password. Click the link below to reset it:</p>
      <a href="${resetUrl}" style="background-color: #007bff; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Reset Password</a>
      <p>This link will expire in 1 hour.</p>
      <p>If you didn't request this, please ignore this email.</p>
    `
    };
    await transporter.sendMail(mailOptions);
};
exports.sendResetPasswordEmail = sendResetPasswordEmail;
const sendPasswordChangedEmail = async (email) => {
    const mailOptions = {
        from: process.env.FROM_USER,
        to: email,
        subject: 'Password Changed Successfully',
        html: `
      <h1>Password Changed</h1>
      <p>Your password has been changed successfully.</p>
      <p>If you didn't make this change, please contact support immediately.</p>
    `
    };
    await transporter.sendMail(mailOptions);
};
exports.sendPasswordChangedEmail = sendPasswordChangedEmail;
const sendPasswordResetOTPEmail = async (email, otp, firstName) => {
    console.log("sendPasswordResetOTPEmail", { email, otp, firstName });
    const mailOptions = {
        from: process.env.FROM_USER,
        to: email,
        subject: 'Password Reset Code',
        html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 10px;">
        <div style="text-align: center; margin-bottom: 20px;">
          <h1 style="color: #5379f4;">Password Reset</h1>
        </div>
        
        <div style="padding: 20px; background-color: #f8f9fa; border-radius: 8px;">
          <p style="font-size: 16px; color: #333;">Hello ${firstName || 'User'},</p>
          
          <p style="font-size: 16px; color: #333; margin-bottom: 20px;">
            We received a request to reset your password. Use the verification code below to proceed:
          </p>
          
          <div style="text-align: center; margin: 30px 0;">
            <div style="font-size: 36px; font-weight: bold; letter-spacing: 8px; color: #5379f4; background-color: #e8f0fe; padding: 15px; border-radius: 8px; display: inline-block;">
              ${otp}
            </div>
          </div>
          
          <p style="font-size: 14px; color: #666; margin-bottom: 10px;">
            This code will expire in <strong>15 minutes</strong>.
          </p>
          
          <p style="font-size: 14px; color: #666; margin-bottom: 20px;">
            If you didn't request a password reset, please ignore this email or contact support.
          </p>
          
          <hr style="border: none; border-top: 1px solid #e0e0e0; margin: 20px 0;">
          
          <p style="font-size: 12px; color: #999; text-align: center;">
            For security reasons, never share this code with anyone.
          </p>
        </div>
        
        <div style="text-align: center; margin-top: 20px; color: #999; font-size: 12px;">
          <p>&copy; ${new Date().getFullYear()} Instantly. All rights reserved.</p>
        </div>
      </div>
    `
    };
    await transporter.sendMail(mailOptions);
};
exports.sendPasswordResetOTPEmail = sendPasswordResetOTPEmail;
const sendVerificationEmail = async (email, verificationToken) => {
    const verificationUrl = `${process.env.CLIENT_URL}/verify-email?token=${verificationToken}`;
    console.log("sendVerificationEmail");
    console.log("email:", email);
    const mailOptions = {
        from: process.env.FROM_USER,
        to: email,
        subject: 'Verify Your Email Address',
        html: `
      <h1>Email Verification</h1>
      <p>Thank you for signing up! Please verify your email address by clicking the link below:</p>
      <a href="${verificationUrl}" style="background-color: #28a745; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Verify Email</a>
      <p>This link will expire in 24 hours.</p>
      <p>If you didn't create an account, please ignore this email.</p>
    `
    };
    await transporter.sendMail(mailOptions);
};
exports.sendVerificationEmail = sendVerificationEmail;
const sendWelcomeEmail = async (email, firstName) => {
    const mailOptions = {
        from: process.env.FROM_USER,
        to: email,
        subject: 'Welcome to Instantly!',
        html: `
      <h1>Welcome, ${firstName}!</h1>
      <p>Your account has been successfully verified and you're now ready to use Instantly.</p>
      <p>Thank you for joining us!</p>
    `
    };
    await transporter.sendMail(mailOptions);
};
exports.sendWelcomeEmail = sendWelcomeEmail;
const sendEmailOTP = async (email, otp) => {
    const mailOptions = {
        from: process.env.FROM_USER,
        to: email,
        subject: 'Email Verification Code',
        html: `
      <h2>Email Verification</h2>
      <p>Your verification code is:</p>
      <h1>${otp}</h1>
      <p>This code expires in 5 minutes.</p>
    `
    };
    await transporter.sendMail(mailOptions);
};
exports.sendEmailOTP = sendEmailOTP;
