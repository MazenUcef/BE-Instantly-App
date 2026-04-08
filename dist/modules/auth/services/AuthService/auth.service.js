"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthService = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const crypto_1 = require("crypto");
const user_repository_1 = require("../../repositories/user.repository");
const otp_1 = require("../../../../shared/utils/otp");
const auth_constants_1 = require("../../../../shared/constants/auth.constants");
const notification_publisher_1 = require("../../../notification/notification.publisher");
const auth_token_service_1 = require("../auth-token.service");
const errorHandler_1 = require("../../../../shared/middlewares/errorHandler");
const rabbitmq_1 = require("../../../../shared/config/rabbitmq");
const redis_1 = __importDefault(require("../../../../shared/config/redis"));
const password_1 = require("../../../../shared/utils/password");
const token_1 = require("../../../../shared/utils/token");
const cloudinary_1 = require("../../../../shared/utils/cloudinary");
const helpers_1 = require("../../../../shared/utils/helpers");
const Government_model_1 = __importDefault(require("../../../government/models/Government.model"));
const Category_model_1 = __importDefault(require("../../../category/models/Category.model"));
const sanitizeUser = (user) => {
    const obj = user.toObject ? user.toObject() : user;
    const { password, ...safeUser } = obj;
    return safeUser;
};
class AuthService {
    static async register(req) {
        const session = await mongoose_1.default.startSession();
        let createdUser = null;
        let emailOtp = null;
        try {
            let responseData = null;
            await session.withTransaction(async () => {
                const data = req.body;
                const existingUser = await user_repository_1.UserRepository.findByEmailOrPhone(data.email, data.phoneNumber, session);
                if (existingUser) {
                    if (existingUser.email === data.email) {
                        if (existingUser.isEmailVerified) {
                            throw new errorHandler_1.AppError("User already exists", 409);
                        }
                        emailOtp = (0, otp_1.generateOTP)();
                        responseData = {
                            reuseUnverified: true,
                            email: existingUser.email,
                            firstName: existingUser.firstName,
                            userId: existingUser._id.toString(),
                        };
                        return;
                    }
                    if (existingUser.phoneNumber === data.phoneNumber) {
                        throw new errorHandler_1.AppError("Phone number already registered", 409);
                    }
                }
                if (!data.address) {
                    throw new errorHandler_1.AppError("Address is required", 400);
                }
                if (data.role === auth_constants_1.AUTH_ROLES.SUPPLIER) {
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
                    const [governments, category] = await Promise.all([
                        Government_model_1.default.find({ _id: { $in: data.governmentIds } }).session(session),
                        Category_model_1.default.findById(data.categoryId).session(session),
                    ]);
                    if (governments.length !== data.governmentIds.length) {
                        throw new errorHandler_1.AppError("One or more governments are invalid", 400);
                    }
                    if (!category) {
                        throw new errorHandler_1.AppError("Invalid category", 400);
                    }
                }
                const files = req.files;
                if (!files?.profilePicture?.[0]) {
                    throw new errorHandler_1.AppError("Profile picture is required", 400);
                }
                (0, helpers_1.validateFile)(files.profilePicture[0]);
                const upload = await (0, cloudinary_1.uploadToCloudinary)(files.profilePicture[0]);
                createdUser = await user_repository_1.UserRepository.createUser({
                    ...data,
                    password: await (0, password_1.hashPassword)(data.password),
                    categoryId: data.role === auth_constants_1.AUTH_ROLES.SUPPLIER ? data.categoryId : null,
                    governmentIds: data.role === auth_constants_1.AUTH_ROLES.SUPPLIER ? data.governmentIds : [],
                    jobTitles: data.role === auth_constants_1.AUTH_ROLES.SUPPLIER ? data.jobTitles : [],
                    profilePicture: upload.secure_url,
                    isEmailVerified: false,
                    isPhoneVerified: true,
                    isProfileComplete: false,
                }, session);
                emailOtp = (0, otp_1.generateOTP)();
                responseData = {
                    created: true,
                    email: createdUser.email,
                    firstName: createdUser.firstName,
                    userId: createdUser._id.toString(),
                };
            });
            if (responseData?.reuseUnverified) {
                await (0, otp_1.saveEmailOTP)(responseData.email, emailOtp);
                await (0, rabbitmq_1.publishToQueue)(auth_constants_1.AUTH_QUEUE_EVENTS.USER_REGISTERED, {
                    userId: responseData.userId,
                    email: responseData.email,
                    firstName: responseData.firstName,
                    otp: emailOtp,
                    isResend: true,
                });
                return {
                    success: true,
                    message: "This email is already registered but not verified. A new verification code has been sent to your email.",
                    requiresVerification: true,
                    email: responseData.email,
                };
            }
            await (0, otp_1.saveEmailOTP)(createdUser.email, emailOtp);
            await (0, rabbitmq_1.publishToQueue)(auth_constants_1.AUTH_QUEUE_EVENTS.USER_REGISTERED, {
                userId: createdUser._id.toString(),
                email: createdUser.email,
                firstName: createdUser.firstName,
                otp: emailOtp,
            });
            return {
                success: true,
                message: "Registration successful. Please check your email for verification code.",
                requiresVerification: true,
                email: createdUser.email,
            };
        }
        finally {
            await session.endSession();
        }
    }
    static async changePassword(input) {
        const { userId, currentPassword, newPassword, sessionId } = input;
        const user = await user_repository_1.UserRepository.findById(userId);
        if (!user) {
            throw new errorHandler_1.AppError("User not found", 404);
        }
        const isValid = await (0, password_1.comparePassword)(currentPassword, user.password);
        if (!isValid) {
            throw new errorHandler_1.AppError("Current password is incorrect", 400);
        }
        const samePassword = await (0, password_1.comparePassword)(newPassword, user.password);
        if (samePassword) {
            throw new errorHandler_1.AppError("New password must be different from current password", 400);
        }
        const hashedPassword = await (0, password_1.hashPassword)(newPassword);
        await user_repository_1.UserRepository.updateById(userId, {
            password: hashedPassword,
        });
        if (sessionId) {
            await auth_token_service_1.AuthTokenService.revokeSession(userId, sessionId);
        }
        await (0, rabbitmq_1.publishToQueue)(auth_constants_1.AUTH_QUEUE_EVENTS.EMAIL_JOBS, {
            type: "password_changed_email",
            to: user.email,
            data: {
                firstName: user.firstName,
            },
        });
        await (0, notification_publisher_1.publishNotification)({
            userId,
            type: auth_constants_1.AUTH_NOTIFICATION_TYPES.PASSWORD_CHANGED,
            title: "Password Changed",
            message: "Your password was successfully changed.",
        });
        return {
            success: true,
            message: "Password changed successfully. Please log in again.",
        };
    }
    static async verifyEmailOTP(email, otp) {
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
        const existingUser = await user_repository_1.UserRepository.findByEmail(email);
        if (!existingUser) {
            throw new errorHandler_1.AppError("User not found", 404);
        }
        const user = await user_repository_1.UserRepository.updateById(existingUser._id, {
            isEmailVerified: true,
            isProfileComplete: true,
        });
        if (user) {
            await (0, rabbitmq_1.publishToQueue)(auth_constants_1.AUTH_QUEUE_EVENTS.EMAIL_JOBS, {
                type: "welcome_email",
                to: user.email,
                data: { firstName: user.firstName },
            });
            await (0, notification_publisher_1.publishNotification)({
                userId: user._id.toString(),
                type: auth_constants_1.AUTH_NOTIFICATION_TYPES.ACCOUNT_VERIFIED,
                title: "Account Verified 🎉",
                message: "Your email has been successfully verified.",
            });
        }
        return { success: true };
    }
    static async resendVerificationEmail(email) {
        if (!email) {
            throw new errorHandler_1.AppError("Email is required", 400);
        }
        const user = await user_repository_1.UserRepository.findByEmail(email);
        if (!user) {
            return {
                success: true,
                message: "If your email is registered, a verification code will be sent",
            };
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
        await (0, rabbitmq_1.publishToQueue)(auth_constants_1.AUTH_QUEUE_EVENTS.USER_REGISTERED, {
            userId: user._id.toString(),
            email: user.email,
            firstName: user.firstName,
            otp: emailOtp,
            isResend: true,
        });
        return {
            success: true,
            message: "Verification email has been resent successfully",
        };
    }
    static async login(email, password) {
        const normalizedEmail = email.toLowerCase().trim();
        const lockKey = `login:lock:${normalizedEmail}`;
        if (await redis_1.default.get(lockKey)) {
            throw new errorHandler_1.AppError("Account locked. Try later.", 429);
        }
        const user = await user_repository_1.UserRepository.findByEmail(normalizedEmail);
        if (!user || !(await (0, password_1.comparePassword)(password, user.password))) {
            const attemptsKey = `login:attempts:${normalizedEmail}`;
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
            await (0, rabbitmq_1.publishToQueue)(auth_constants_1.AUTH_QUEUE_EVENTS.EMAIL_JOBS, {
                type: "otp_email",
                to: user.email,
                data: { otp: emailOtp },
            });
            throw new errorHandler_1.AppError("Email not verified. A new verification code has been sent.", 403);
        }
        await redis_1.default.del(`login:attempts:${normalizedEmail}`);
        if (!user.isProfileComplete) {
            throw new errorHandler_1.AppError("Account not verified", 403);
        }
        let category = null;
        let governments = [];
        if (user.governmentIds?.length > 0) {
            const govs = await Government_model_1.default.find({
                _id: { $in: user.governmentIds },
                isActive: true,
            }).sort({ order: 1 });
            governments = govs.map((gov) => ({
                id: gov._id,
                name: gov.name,
                nameAr: gov.nameAr,
                country: gov.country,
                order: gov.order,
            }));
        }
        if (user.role === auth_constants_1.AUTH_ROLES.SUPPLIER) {
            if (!user.categoryId) {
                throw new errorHandler_1.AppError("Supplier account missing category", 400);
            }
            const categoryDoc = await Category_model_1.default.findById(user.categoryId);
            if (!categoryDoc) {
                throw new errorHandler_1.AppError("User category not found", 400);
            }
            const categoryObj = categoryDoc.toObject();
            const { jobs, ...withoutJobs } = categoryObj;
            category = withoutJobs;
        }
        const tokens = await auth_token_service_1.AuthTokenService.issueTokens(user);
        return {
            accessToken: tokens.accessToken,
            refreshToken: tokens.refreshToken,
            user: sanitizeUser(user),
            category,
            governments,
        };
    }
    static async refreshToken(refreshToken) {
        const decoded = (0, token_1.verifyRefreshToken)(refreshToken);
        const saved = await redis_1.default.get(`refresh:${decoded.userId}:${decoded.sessionId}`);
        if (saved !== refreshToken) {
            throw new errorHandler_1.AppError("Invalid refresh token", 401);
        }
        const user = await user_repository_1.UserRepository.findById(decoded.userId);
        if (!user) {
            throw new errorHandler_1.AppError("User not found", 404);
        }
        const tokens = await auth_token_service_1.AuthTokenService.rotateRefreshToken(user, decoded.sessionId, decoded.userId);
        return {
            accessToken: tokens.accessToken,
            refreshToken: tokens.refreshToken,
        };
    }
    static async logout(userId, sessionId, token) {
        await auth_token_service_1.AuthTokenService.revokeSession(userId, sessionId);
        await auth_token_service_1.AuthTokenService.blacklistAccessToken(token);
        return { success: true };
    }
    static async forgotPassword(email) {
        const user = await user_repository_1.UserRepository.findByEmail(email);
        if (!user) {
            return {
                success: true,
                message: "If your email is registered, a password reset code will be sent",
            };
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
        await (0, rabbitmq_1.publishToQueue)(auth_constants_1.AUTH_QUEUE_EVENTS.EMAIL_JOBS, {
            type: "password_reset_otp",
            to: email,
            data: {
                otp: resetOTP,
                firstName: user.firstName,
            },
        });
        return {
            success: true,
            message: "Password reset code has been sent to your email",
            email,
        };
    }
    static async verifyResetOTP(email, otp) {
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
        return {
            success: true,
            message: "OTP verified successfully",
            token: resetToken,
        };
    }
    static async resetPassword(token, password) {
        if (!token || !password) {
            throw new errorHandler_1.AppError("Token and new password are required", 400);
        }
        const hashedToken = (0, crypto_1.createHash)("sha256").update(token).digest("hex");
        const userId = await redis_1.default.get(`reset:password:token:${hashedToken}`);
        if (!userId) {
            throw new errorHandler_1.AppError("Invalid or expired reset token", 400);
        }
        const user = await user_repository_1.UserRepository.updateById(userId, {
            password: await (0, password_1.hashPassword)(password),
        });
        if (!user) {
            throw new errorHandler_1.AppError("User not found", 404);
        }
        await redis_1.default.del(`reset:password:token:${hashedToken}`);
        await (0, rabbitmq_1.publishToQueue)(auth_constants_1.AUTH_QUEUE_EVENTS.EMAIL_JOBS, {
            type: "password_changed_email",
            to: user.email,
            data: {
                firstName: user.firstName,
            },
        });
        await (0, notification_publisher_1.publishNotification)({
            userId,
            type: auth_constants_1.AUTH_NOTIFICATION_TYPES.PASSWORD_CHANGED,
            title: "Password Changed",
            message: "Your password was successfully updated.",
        });
        return {
            success: true,
            message: "Password has been reset successfully",
        };
    }
    static async switchRole(input) {
        const { userId, currentRole, sessionId, targetRole, categoryId, jobs, governmentIds, } = input;
        if (![auth_constants_1.AUTH_ROLES.CUSTOMER, auth_constants_1.AUTH_ROLES.SUPPLIER].includes(targetRole)) {
            throw new errorHandler_1.AppError("Invalid target role", 400);
        }
        if (currentRole === targetRole) {
            throw new errorHandler_1.AppError("You already have this role", 400);
        }
        const dbSession = await mongoose_1.default.startSession();
        let updatedUser = null;
        let categoryData = null;
        try {
            await dbSession.withTransaction(async () => {
                const user = await user_repository_1.UserRepository.findById(userId, dbSession);
                if (!user) {
                    throw new errorHandler_1.AppError("User not found", 404);
                }
                if (targetRole === auth_constants_1.AUTH_ROLES.SUPPLIER) {
                    const finalCategoryId = user.categoryId || categoryId;
                    if (!finalCategoryId) {
                        throw new errorHandler_1.AppError("Category is required to become supplier", 400);
                    }
                    const category = await Category_model_1.default.findById(finalCategoryId).session(dbSession);
                    if (!category) {
                        throw new errorHandler_1.AppError("Invalid category", 400);
                    }
                    categoryData = category;
                    const finalJobs = user.jobTitles?.length > 0 ? user.jobTitles : jobs || [];
                    if (!Array.isArray(finalJobs) || finalJobs.length === 0) {
                        throw new errorHandler_1.AppError("At least one job title is required for supplier", 400);
                    }
                    const finalGovernmentIds = user.governmentIds?.length > 0
                        ? user.governmentIds
                        : governmentIds || [];
                    if (!Array.isArray(finalGovernmentIds) ||
                        finalGovernmentIds.length === 0) {
                        throw new errorHandler_1.AppError("At least one government/service area is required for supplier", 400);
                    }
                    const governments = await Government_model_1.default.find({
                        _id: { $in: finalGovernmentIds },
                    }).session(dbSession);
                    if (governments.length !== finalGovernmentIds.length) {
                        throw new errorHandler_1.AppError("One or more governments are invalid", 400);
                    }
                    user.categoryId = finalCategoryId;
                    user.jobTitles = finalJobs;
                    user.governmentIds = finalGovernmentIds;
                }
                user.role = targetRole;
                await user.save({ session: dbSession });
                updatedUser = user;
            });
        }
        finally {
            await dbSession.endSession();
        }
        await auth_token_service_1.AuthTokenService.revokeSession(userId, sessionId);
        const tokens = await auth_token_service_1.AuthTokenService.issueTokens(updatedUser);
        await (0, notification_publisher_1.publishNotification)({
            userId,
            type: auth_constants_1.AUTH_NOTIFICATION_TYPES.ROLE_SWITCHED,
            title: "Role Updated",
            message: `Your account role is now ${targetRole}.`,
            data: {
                targetRole,
                categoryId: updatedUser.categoryId,
                governmentIds: updatedUser.governmentIds,
                jobTitles: updatedUser.jobTitles,
            },
        });
        let cleanedCategoryData = null;
        if (targetRole === auth_constants_1.AUTH_ROLES.SUPPLIER && categoryData) {
            const categoryObj = categoryData.toObject();
            const { jobs, ...withoutJobs } = categoryObj;
            cleanedCategoryData = withoutJobs;
        }
        return {
            success: true,
            accessToken: tokens.accessToken,
            refreshToken: tokens.refreshToken,
            user: sanitizeUser(updatedUser),
            categoryData: cleanedCategoryData,
        };
    }
}
exports.AuthService = AuthService;
