"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.removeDevice = exports.biometricLogin = exports.registerDevice = exports.deleteUser = exports.updateUser = exports.getUserById = exports.getAllUsers = exports.switchRole = exports.resendVerificationEmail = exports.resetPassword = exports.verifyResetOTP = exports.forgotPassword = exports.logout = exports.refreshToken = exports.login = exports.verifyEmailOTP = exports.register = void 0;
const mongoose_1 = __importStar(require("mongoose"));
const User_model_1 = __importDefault(require("../models/User.model"));
const crypto_1 = require("crypto");
const crypto_2 = __importDefault(require("crypto"));
const errorHandler_1 = require("../../../shared/middlewares/errorHandler");
const helpers_1 = require("../../../shared/utils/helpers");
const cloudinary_1 = require("../../../shared/utils/cloudinary");
const password_1 = require("../../../shared/utils/password");
const otp_1 = require("../../../shared/utils/otp");
const redis_1 = __importDefault(require("../../../shared/config/redis"));
const token_1 = require("../../../shared/utils/token");
const notification_publisher_1 = require("../../notification/notification.publisher");
const Category_model_1 = __importDefault(require("../../category/models/Category.model"));
const rabbitmq_1 = require("../../../shared/config/rabbitmq");
const Government_model_1 = __importDefault(require("../../government/models/Government.model"));
const register = async (req, res) => {
    try {
        console.log("req.body:", req.body);
        console.log("req.files:", req.files);
        const data = req.body;
        console.log("data", data);
        const existingUser = await User_model_1.default.findOne({
            $or: [{ email: data.email }, { phoneNumber: data.phoneNumber }],
        });
        if (existingUser) {
            if (existingUser.email === data.email) {
                if (existingUser.isEmailVerified) {
                    throw new errorHandler_1.AppError("User already exists", 409);
                }
                const emailOtp = (0, otp_1.generateOTP)();
                await (0, otp_1.saveEmailOTP)(existingUser.email, emailOtp);
                await (0, rabbitmq_1.publishToQueue)("USER_REGISTERED", {
                    userId: existingUser._id.toString(),
                    email: existingUser.email,
                    firstName: existingUser.firstName,
                    otp: emailOtp,
                    isResend: true,
                });
                return res.status(200).json({
                    success: true,
                    message: "This email is already registered but not verified. A new verification code has been sent to your email.",
                    requiresVerification: true,
                    email: existingUser.email,
                });
            }
            if (existingUser.phoneNumber === data.phoneNumber) {
                throw new errorHandler_1.AppError("Phone number already registered", 409);
            }
        }
        if (!data.address) {
            throw new errorHandler_1.AppError("Address is required", 400);
        }
        if (data.role === "supplier") {
            if (!data.categoryId) {
                throw new errorHandler_1.AppError("Category is required for supplier", 400);
            }
            if (!Array.isArray(data.jobTitles) || data.jobTitles.length === 0) {
                throw new errorHandler_1.AppError("At least one job title is required for supplier", 400);
            }
            if (!Array.isArray(data.governmentIds) ||
                data.governmentIds.length === 0) {
                throw new errorHandler_1.AppError("At least one government/service area is required for supplier", 400);
            }
            const governments = await Government_model_1.default.find({
                _id: { $in: data.governmentIds },
            });
            if (governments.length !== data.governmentIds.length) {
                throw new errorHandler_1.AppError("One or more governments are invalid", 400);
            }
            const category = await Category_model_1.default.findById(data.categoryId);
            if (!category) {
                throw new errorHandler_1.AppError("Invalid category", 400);
            }
        }
        const files = req.files;
        if (!files?.profilePicture?.[0]) {
            throw new errorHandler_1.AppError("Profile picture is required", 400);
        }
        (0, helpers_1.validateFile)(files.profilePicture[0]);
        const profilePictureUpload = await (0, cloudinary_1.uploadToCloudinary)(files.profilePicture[0]);
        const user = await User_model_1.default.create({
            ...data,
            password: await (0, password_1.hashPassword)(data.password),
            categoryId: data.role === "supplier" ? data.categoryId : null,
            jobTitles: data.role === "supplier" ? data.jobTitles : [],
            governmentIds: data.role === "supplier" ? data.governmentIds : [],
            profilePicture: profilePictureUpload.secure_url,
            isEmailVerified: false,
            isPhoneVerified: true,
            isProfileComplete: false,
        });
        const emailOtp = (0, otp_1.generateOTP)();
        await (0, otp_1.saveEmailOTP)(user.email, emailOtp);
        console.log("📤 Publishing to USER_REGISTERED queue:", {
            userId: user._id.toString(),
            email: user.email,
            otp: emailOtp,
        });
        await (0, rabbitmq_1.publishToQueue)("USER_REGISTERED", {
            userId: user._id.toString(),
            email: user.email,
            firstName: user.firstName,
            otp: emailOtp,
        });
        res.status(201).json({
            success: true,
            message: "Registration successful. Please check your email for verification code.",
            requiresVerification: true,
            email: user.email,
        });
    }
    catch (error) {
        console.error("Registration error details:", {
            message: error.message,
            stack: error.stack,
            statusCode: error.statusCode,
        });
        res.status(error.statusCode || 500).json({
            success: false,
            message: error.message,
        });
    }
};
exports.register = register;
const verifyEmailOTP = async (req, res) => {
    const { email, otp } = req.body;
    const attemptsKey = `otp:email:attempts:${email}`;
    const attempts = Number(await redis_1.default.get(attemptsKey)) || 0;
    if (attempts >= 5) {
        throw new errorHandler_1.AppError("Too many OTP attempts", 429);
    }
    const valid = await (0, otp_1.verifyEmailOTPUtil)(email, otp);
    if (!valid) {
        await redis_1.default.incr(attemptsKey);
        await redis_1.default.expire(attemptsKey, 300);
        throw new errorHandler_1.AppError("Invalid OTP", 400);
    }
    await redis_1.default.del(attemptsKey);
    const user = await User_model_1.default.findOneAndUpdate({ email }, { isEmailVerified: true, isProfileComplete: true }, { new: true });
    if (user) {
        await (0, rabbitmq_1.publishToQueue)("email_jobs", {
            type: "welcome_email",
            to: user.email,
            data: {
                firstName: user.firstName,
            },
        });
        await (0, notification_publisher_1.publishNotification)({
            userId: user._id.toString(),
            type: "account_verified",
            title: "Account Verified 🎉",
            message: "Your email has been successfully verified.",
        });
    }
    res.json({ success: true });
};
exports.verifyEmailOTP = verifyEmailOTP;
const login = async (req, res) => {
    try {
        const { email, password } = req.body;
        const lockKey = `login:lock:${email}`;
        if (await redis_1.default.get(lockKey)) {
            throw new errorHandler_1.AppError("Account locked. Try later.", 429);
        }
        const user = await User_model_1.default.findOne({ email });
        if (!user || !(await (0, password_1.comparePassword)(password, user.password))) {
            const attemptsKey = `login:attempts:${email}`;
            const attempts = Number(await redis_1.default.incr(attemptsKey));
            if (attempts >= 5) {
                await redis_1.default.set(lockKey, "1", "EX", 900);
            }
            await redis_1.default.expire(attemptsKey, 900);
            throw new errorHandler_1.AppError("Invalid credentials", 400);
        }
        if (!user.isEmailVerified) {
            const emailOtp = (0, otp_1.generateOTP)();
            await (0, otp_1.saveEmailOTP)(user.email, emailOtp);
            await (0, rabbitmq_1.publishToQueue)("email_jobs", {
                type: "otp_email",
                to: user.email,
                data: {
                    otp: emailOtp,
                },
            });
            throw new errorHandler_1.AppError("Email not verified. we have been sent a new email.", 403);
        }
        await redis_1.default.del(`login:attempts:${email}`);
        if (!user.isProfileComplete) {
            throw new errorHandler_1.AppError("Account not verified", 403);
        }
        let categoryData = null;
        let governmentsData = [];
        if (user.governmentIds && user.governmentIds.length > 0) {
            const governmentObjectIds = user.governmentIds.map((id) => new mongoose_1.default.Types.ObjectId(id.toString()));
            const governments = await Government_model_1.default.find({
                _id: { $in: governmentObjectIds },
                isActive: true,
            }).sort({ order: 1 });
            governmentsData = governments.map((gov) => ({
                id: gov._id,
                name: gov.name,
                nameAr: gov.nameAr,
                country: gov.country,
                order: gov.order,
            }));
        }
        if (user.role === "supplier") {
            if (!user.categoryId) {
                throw new errorHandler_1.AppError("Supplier account missing category", 400);
            }
            const category = await Category_model_1.default.findById(new mongoose_1.default.Types.ObjectId(user.categoryId.toString()));
            if (!category) {
                throw new errorHandler_1.AppError("User category not found", 400);
            }
            categoryData = category;
        }
        const sessionId = crypto_2.default.randomUUID();
        const payload = {
            userId: user._id.toString(),
            role: user.role,
            name: `${user.firstName} ${user.lastName}`,
            categoryId: user.categoryId,
            governmentIds: user.governmentIds,
            sessionId,
        };
        const accessToken = (0, token_1.generateToken)(payload);
        const refreshToken = (0, token_1.generateRefreshToken)(payload);
        await redis_1.default.set(`refresh:${user._id}:${sessionId}`, refreshToken, "EX", 7 * 24 * 60 * 60);
        const userObj = user.toObject();
        const categoryDataWithoutJobs = categoryData?.toObject();
        const { password: _, ...safeUser } = userObj;
        const { jobs, ...category } = categoryDataWithoutJobs || { jobs: [] };
        res.json({
            accessToken,
            refreshToken,
            user: {
                ...safeUser,
            },
            category,
            governments: governmentsData,
        });
    }
    catch (error) {
        res.status(error.statusCode || 500).json({
            message: error.message,
        });
    }
};
exports.login = login;
const refreshToken = async (req, res) => {
    const { refreshToken } = req.body;
    const decoded = (0, token_1.verifyRefreshToken)(refreshToken);
    const saved = await redis_1.default.get(`refresh:${decoded.userId}:${decoded.sessionId}`);
    if (saved !== refreshToken) {
        throw new errorHandler_1.AppError("Invalid refresh token", 401);
    }
    const user = await User_model_1.default.findById(decoded.userId);
    if (!user)
        throw new errorHandler_1.AppError("User not found", 404);
    const newSessionId = crypto_2.default.randomUUID();
    const payload = {
        userId: user._id.toString(),
        role: user.role,
        sessionId: newSessionId,
        name: `${user.firstName} ${user.lastName}`,
        governmentIds: user.governmentIds,
        categoryId: user.categoryId,
    };
    const newAccessToken = (0, token_1.generateToken)(payload);
    const newRefreshToken = (0, token_1.generateRefreshToken)(payload);
    await redis_1.default.set(`refresh:${decoded.userId}:${newSessionId}`, newRefreshToken, "EX", 7 * 24 * 60 * 60);
    await redis_1.default.del(`refresh:${decoded.userId}:${decoded.sessionId}`);
    res.json({
        accessToken: newAccessToken,
        refreshToken: newRefreshToken,
    });
};
exports.refreshToken = refreshToken;
const logout = async (req, res) => {
    const { userId, sessionId, token } = req.user;
    await redis_1.default.del(`refresh:${userId}:${sessionId}`);
    await redis_1.default.set(`bl:access:${token}`, "1", "EX", 900);
    res.json({ success: true });
};
exports.logout = logout;
const forgotPassword = async (req, res) => {
    try {
        const { email } = req.body;
        const user = await User_model_1.default.findOne({ email });
        if (!user) {
            return res.json({
                success: true,
                message: "If your email is registered, a password reset code will be sent",
            });
        }
        const rateLimitKey = `forgot:password:${email}`;
        const requests = Number(await redis_1.default.get(rateLimitKey)) || 0;
        if (requests >= 3) {
            throw new errorHandler_1.AppError("Too many password reset attempts. Please try again later.", 429);
        }
        const resetOTP = (0, otp_1.generateOTP)();
        const otpKey = `reset:password:otp:${email}`;
        await redis_1.default.set(otpKey, JSON.stringify({
            otp: resetOTP,
            userId: user._id.toString(),
            attempts: 0,
        }), "EX", 900);
        await redis_1.default.incr(rateLimitKey);
        await redis_1.default.expire(rateLimitKey, 3600);
        await (0, rabbitmq_1.publishToQueue)("email_jobs", {
            type: "password_reset_otp",
            to: email,
            data: {
                otp: resetOTP,
                firstName: user.firstName,
            },
        });
        console.log("📤 Password reset OTP sent to:", { email, otp: resetOTP });
        res.json({
            success: true,
            message: "Password reset code has been sent to your email",
            email: email,
        });
    }
    catch (error) {
        console.error("Error in forgotPassword:", error);
        res.status(error.statusCode || 500).json({
            success: false,
            message: error.message || "Failed to process password reset request",
        });
    }
};
exports.forgotPassword = forgotPassword;
const verifyResetOTP = async (req, res) => {
    try {
        const { email, otp } = req.body;
        if (!email || !otp) {
            throw new errorHandler_1.AppError("Email and OTP are required", 400);
        }
        const otpKey = `reset:password:otp:${email}`;
        const otpDataStr = await redis_1.default.get(otpKey);
        if (!otpDataStr) {
            throw new errorHandler_1.AppError("OTP has expired or is invalid. Please request a new one.", 400);
        }
        const otpData = JSON.parse(otpDataStr);
        if (otpData.attempts >= 5) {
            await redis_1.default.del(otpKey);
            throw new errorHandler_1.AppError("Too many invalid attempts. Please request a new OTP.", 429);
        }
        if (otpData.otp !== otp) {
            otpData.attempts += 1;
            await redis_1.default.set(otpKey, JSON.stringify(otpData), "EX", 900);
            throw new errorHandler_1.AppError("Invalid OTP code", 400);
        }
        const resetToken = (0, crypto_1.randomBytes)(32).toString("hex");
        const hashedToken = (0, crypto_1.createHash)("sha256").update(resetToken).digest("hex");
        await redis_1.default.set(`reset:password:token:${hashedToken}`, otpData.userId, "EX", 600);
        await redis_1.default.del(otpKey);
        res.json({
            success: true,
            message: "OTP verified successfully",
            token: resetToken,
        });
    }
    catch (error) {
        console.error("Error in verifyResetOTP:", error);
        res.status(error.statusCode || 500).json({
            success: false,
            message: error.message || "Failed to verify OTP",
        });
    }
};
exports.verifyResetOTP = verifyResetOTP;
const resetPassword = async (req, res) => {
    try {
        const { token, password } = req.body;
        if (!token || !password) {
            throw new errorHandler_1.AppError("Token and new password are required", 400);
        }
        const hashedToken = (0, crypto_1.createHash)("sha256").update(token).digest("hex");
        const userId = await redis_1.default.get(`reset:password:token:${hashedToken}`);
        if (!userId) {
            throw new errorHandler_1.AppError("Invalid or expired reset token", 400);
        }
        const user = await User_model_1.default.findByIdAndUpdate(userId, { password: await (0, password_1.hashPassword)(password) }, { new: true });
        if (!user) {
            throw new errorHandler_1.AppError("User not found", 404);
        }
        await redis_1.default.del(`reset:password:token:${hashedToken}`);
        await (0, rabbitmq_1.publishToQueue)("email_jobs", {
            type: "password_changed_email",
            to: user.email,
            data: {
                firstName: user.firstName,
            },
        });
        await (0, notification_publisher_1.publishNotification)({
            userId: userId,
            type: "password_changed",
            title: "Password Changed",
            message: "Your password was successfully updated.",
        });
        res.json({
            success: true,
            message: "Password has been reset successfully",
        });
    }
    catch (error) {
        console.error("Error in resetPassword:", error);
        res.status(error.statusCode || 500).json({
            success: false,
            message: error.message || "Failed to reset password",
        });
    }
};
exports.resetPassword = resetPassword;
const resendVerificationEmail = async (req, res) => {
    try {
        const { email } = req.body;
        if (!email) {
            throw new errorHandler_1.AppError("Email is required", 400);
        }
        const user = await User_model_1.default.findOne({ email });
        if (!user) {
            return res.json({
                success: true,
                message: "If your email is registered, a verification code will be sent",
            });
        }
        if (user.isEmailVerified) {
            throw new errorHandler_1.AppError("Email is already verified", 400);
        }
        const rateLimitKey = `resend:otp:${email}`;
        const requests = Number(await redis_1.default.get(rateLimitKey)) || 0;
        if (requests >= 3) {
            throw new errorHandler_1.AppError("Too many resend attempts. Please try again later.", 429);
        }
        const emailOtp = (0, otp_1.generateOTP)();
        await (0, otp_1.saveEmailOTP)(user.email, emailOtp);
        await redis_1.default.incr(rateLimitKey);
        await redis_1.default.expire(rateLimitKey, 3600);
        console.log("📤 Resending verification email to:", {
            userId: user._id.toString(),
            email: user.email,
            otp: emailOtp,
        });
        await (0, rabbitmq_1.publishToQueue)("USER_REGISTERED", {
            userId: user._id.toString(),
            email: user.email,
            firstName: user.firstName,
            otp: emailOtp,
            isResend: true,
        });
        console.log("✅ Resend verification email published successfully");
        res.json({
            success: true,
            message: "Verification email has been resent successfully",
        });
    }
    catch (error) {
        console.error("Error in resendVerificationEmail:", error);
        res.status(error.statusCode || 500).json({
            success: false,
            message: error.message || "Failed to resend verification email",
        });
    }
};
exports.resendVerificationEmail = resendVerificationEmail;
const switchRole = async (req, res) => {
    console.log("switchRole - req.user:", req.user);
    console.log("switchRole - req.body:", req.body);
    console.log("switchRole - req.headers.content-type:", req.headers["content-type"]);
    const { userId, role, sessionId } = req.user;
    const { targetRole, categoryId, jobs, governmentIds } = req.body;
    console.log("req.body", req.body);
    if (!["customer", "supplier"].includes(targetRole)) {
        throw new errorHandler_1.AppError("Invalid target role", 400);
    }
    if (role === targetRole) {
        throw new errorHandler_1.AppError("You already have this role", 400);
    }
    const user = await User_model_1.default.findById(userId);
    if (!user)
        throw new errorHandler_1.AppError("User not found", 404);
    let categoryData = null;
    if (targetRole === "supplier") {
        if (!user.categoryId) {
            if (!categoryId) {
                throw new errorHandler_1.AppError("Category is required to become supplier", 400);
            }
            user.categoryId = categoryId;
        }
        const category = await Category_model_1.default.findById(new mongoose_1.default.Types.ObjectId(user.categoryId.toString()));
        if (!category) {
            throw new errorHandler_1.AppError("Invalid category", 400);
        }
        categoryData = category;
        if (!user.jobTitles || user.jobTitles.length === 0) {
            if (!Array.isArray(jobs) || jobs.length === 0) {
                throw new errorHandler_1.AppError("At least one job title is required for supplier", 400);
            }
            user.jobTitles = jobs;
        }
        if (!user.governmentIds || user.governmentIds.length === 0) {
            if (!Array.isArray(governmentIds) || governmentIds.length === 0) {
                throw new errorHandler_1.AppError("At least one government/service area is required for supplier", 400);
            }
            const governments = await Government_model_1.default.find({
                _id: { $in: governmentIds },
            });
            if (governments.length !== governmentIds.length) {
                throw new errorHandler_1.AppError("One or more governments are invalid", 400);
            }
            user.governmentIds = governmentIds;
        }
    }
    user.role = targetRole;
    await user.save();
    await redis_1.default.del(`refresh:${userId}:${sessionId}`);
    const newSessionId = crypto_2.default.randomUUID();
    const payload = {
        userId: user._id.toString(),
        role: user.role,
        name: `${user.firstName} ${user.lastName}`,
        categoryId: user.categoryId,
        governmentIds: user.governmentIds,
        sessionId: newSessionId,
    };
    const accessToken = (0, token_1.generateToken)(payload);
    const refreshToken = (0, token_1.generateRefreshToken)(payload);
    await redis_1.default.set(`refresh:${user._id}:${newSessionId}`, refreshToken, "EX", 7 * 24 * 60 * 60);
    const userObj = user.toObject();
    const { password: _, ...safeUser } = userObj;
    if (targetRole === "supplier" && categoryData) {
        const categoryObj = categoryData.toObject();
        const { jobs: _, ...categoryWithoutJobs } = categoryObj;
        categoryData = categoryWithoutJobs;
    }
    await (0, notification_publisher_1.publishNotification)({
        userId: userId,
        type: "role_switched",
        title: "Role Updated",
        message: `Your account role is now ${targetRole}.`,
        data: {
            targetRole,
            categoryId: user.categoryId,
            governmentIds: user.governmentIds,
            jobTitles: user.jobTitles,
        },
    });
    res.json({
        success: true,
        accessToken,
        refreshToken,
        user: safeUser,
        categoryData: targetRole === "supplier" ? categoryData : null,
    });
};
exports.switchRole = switchRole;
const getAllUsers = async (_req, res) => {
    const users = await User_model_1.default.find().sort({ createdAt: -1 });
    const safeUsers = users.map((u) => {
        const { password, ...rest } = u.toObject();
        return rest;
    });
    res.status(200).json({
        count: safeUsers.length,
        data: safeUsers,
    });
};
exports.getAllUsers = getAllUsers;
const getUserById = async (req, res) => {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    if (!mongoose_1.Types.ObjectId.isValid(id)) {
        return res.status(400).json({ message: "Invalid user ID" });
    }
    const user = await User_model_1.default.findById(id);
    if (!user) {
        return res.status(404).json({ message: "User not found" });
    }
    const { password, ...safeUser } = user.toObject();
    res.status(200).json({ data: safeUser });
};
exports.getUserById = getUserById;
const updateUser = async (req, res) => {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const updates = req.body;
    if (!mongoose_1.Types.ObjectId.isValid(id)) {
        return res.status(400).json({ message: "Invalid user ID" });
    }
    const user = await User_model_1.default.findById(id);
    if (!user)
        return res.status(404).json({ message: "User not found" });
    if (updates.password)
        delete updates.password;
    Object.assign(user, updates);
    await user.save();
    const { password, ...safeUser } = user.toObject();
    res
        .status(200)
        .json({ message: "User updated successfully", data: safeUser });
};
exports.updateUser = updateUser;
const deleteUser = async (req, res) => {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    if (!mongoose_1.Types.ObjectId.isValid(id)) {
        return res.status(400).json({ message: "Invalid user ID" });
    }
    const user = await User_model_1.default.findById(id);
    if (!user)
        return res.status(404).json({ message: "User not found" });
    await user.deleteOne();
    res.status(200).json({ message: "User deleted successfully" });
};
exports.deleteUser = deleteUser;
const registerDevice = async (req, res) => {
    const { deviceId, type, passcode } = req.body;
    const { userId } = req.user;
    const user = await User_model_1.default.findById(userId);
    if (!user)
        throw new errorHandler_1.AppError("User not found", 404);
    const existingDevice = user.biometrics?.find((d) => d.deviceId === deviceId);
    if (existingDevice)
        throw new errorHandler_1.AppError("Device already registered", 400);
    const newDevice = { deviceId, type };
    if (type === "passcode") {
        const hashed = await (0, password_1.hashPassword)(passcode);
        newDevice.passcodeHash = hashed;
    }
    user?.biometrics?.push(newDevice);
    await user.save();
    await (0, notification_publisher_1.publishNotification)({
        userId: userId,
        type: "device_registered",
        title: "New Device Registered",
        message: `A new ${type} login device was added to your account.`,
    });
    res.status(200).json({ message: "Device registered for biometric login" });
};
exports.registerDevice = registerDevice;
const biometricLogin = async (req, res) => {
    const { deviceId, type, passcode } = req.body;
    const user = await User_model_1.default.findOne({ "biometrics.deviceId": deviceId });
    if (!user)
        throw new errorHandler_1.AppError("Device not registered", 404);
    const device = user?.biometrics?.find((d) => d.deviceId === deviceId && d.type === type);
    if (!device)
        throw new errorHandler_1.AppError("Device or login type not allowed", 403);
    if (type === "passcode") {
        if (!passcode)
            throw new errorHandler_1.AppError("Passcode required", 400);
        const valid = await (0, password_1.comparePassword)(passcode, device.passcodeHash);
        if (!valid)
            throw new errorHandler_1.AppError("Invalid passcode", 403);
    }
    const sessionId = crypto_2.default.randomUUID();
    const payload = {
        userId: user._id.toString(),
        role: user.role,
        name: `${user.firstName} ${user.lastName}`,
        categoryId: user.categoryId,
        governmentIds: user.governmentIds,
        sessionId,
    };
    const accessToken = (0, token_1.generateToken)(payload);
    const refreshToken = (0, token_1.generateRefreshToken)(payload);
    await redis_1.default.set(`refresh:${user._id}:${sessionId}`, refreshToken, "EX", 7 * 24 * 60 * 60);
    const userObj = user.toObject();
    const { password: _, ...safeUser } = userObj;
    res.json({ accessToken, refreshToken, user: safeUser });
};
exports.biometricLogin = biometricLogin;
const removeDevice = async (req, res) => {
    const { deviceId } = req.body;
    const { userId } = req.user;
    const user = await User_model_1.default.findById(userId);
    if (!user)
        throw new errorHandler_1.AppError("User not found", 404);
    user.biometrics = user?.biometrics?.filter((d) => d.deviceId !== deviceId);
    await user.save();
    await (0, notification_publisher_1.publishNotification)({
        userId: userId,
        type: "device_removed",
        title: "Device Removed",
        message: "A biometric device was removed from your account.",
    });
    res.json({ message: "Device removed successfully" });
};
exports.removeDevice = removeDevice;
