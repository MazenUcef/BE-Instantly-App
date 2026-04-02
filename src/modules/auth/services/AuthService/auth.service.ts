import mongoose from "mongoose";
import { createHash, randomBytes } from "crypto";
import { UserRepository } from "../../repositories/user.repository";
import {
  generateOTP,
  saveEmailOTP,
  verifyEmailOTPUtil,
} from "../../../../shared/utils/otp";
import {
  AUTH_NOTIFICATION_TYPES,
  AUTH_QUEUE_EVENTS,
  AUTH_ROLES,
} from "../../../../shared/constants/auth.constants";
import { publishNotification } from "../../../notification/notification.publisher";
import { AuthTokenService } from "../auth-token.service";
import { AppError } from "../../../../shared/middlewares/errorHandler";
import GovernmentModel from "../../../government/models/government.model";
import CategoryModel from "../../../category/models/Category.model";
import { publishToQueue } from "../../../../shared/config/rabbitmq";
import redis from "../../../../shared/config/redis";
import {
  comparePassword,
  hashPassword,
} from "../../../../shared/utils/password";
import { verifyRefreshToken } from "../../../../shared/utils/token";
import { uploadToCloudinary } from "../../../../shared/utils/cloudinary";
import { validateFile } from "../../../../shared/utils/helpers";
import { Request } from "express";

const sanitizeUser = (user: any) => {
  const obj = user.toObject ? user.toObject() : user;
  const { password, ...safeUser } = obj;
  return safeUser;
};

export class AuthService {
  static async register(req: Request) {
    const session = await mongoose.startSession();

    let createdUser: any = null;
    let emailOtp: string | null = null;

    try {
      let responseData: any = null;

      await session.withTransaction(async () => {
        const data = req.body;

        const existingUser = await UserRepository.findByEmailOrPhone(
          data.email,
          data.phoneNumber,
          session,
        );

        if (existingUser) {
          if (existingUser.email === data.email) {
            if (existingUser.isEmailVerified) {
              throw new AppError("User already exists", 409);
            }

            emailOtp = generateOTP();
            responseData = {
              reuseUnverified: true,
              email: existingUser.email,
              firstName: existingUser.firstName,
              userId: existingUser._id.toString(),
            };
            return;
          }

          if (existingUser.phoneNumber === data.phoneNumber) {
            throw new AppError("Phone number already registered", 409);
          }
        }

        if (!data.address) {
          throw new AppError("Address is required", 400);
        }

        if (data.role === AUTH_ROLES.SUPPLIER) {
          if (!data.categoryId) {
            throw new AppError("Category is required for supplier", 400);
          }

          if (!Array.isArray(data.jobTitles) || data.jobTitles.length === 0) {
            throw new AppError(
              "At least one job title is required for supplier",
              400,
            );
          }

          if (
            !Array.isArray(data.governmentIds) ||
            data.governmentIds.length === 0
          ) {
            throw new AppError(
              "At least one government/service area is required for supplier",
              400,
            );
          }

          const [governments, category] = await Promise.all([
            GovernmentModel.find({ _id: { $in: data.governmentIds } }).session(
              session,
            ),
            CategoryModel.findById(data.categoryId).session(session),
          ]);

          if (governments.length !== data.governmentIds.length) {
            throw new AppError("One or more governments are invalid", 400);
          }

          if (!category) {
            throw new AppError("Invalid category", 400);
          }
        }

        const files = req.files as any;

        if (!files?.profilePicture?.[0]) {
          throw new AppError("Profile picture is required", 400);
        }

        validateFile(files.profilePicture[0]);
        const upload = await uploadToCloudinary(files.profilePicture[0]);

        createdUser = await UserRepository.createUser(
          {
            ...data,
            password: await hashPassword(data.password),
            categoryId:
              data.role === AUTH_ROLES.SUPPLIER ? data.categoryId : null,
            governmentIds:
              data.role === AUTH_ROLES.SUPPLIER ? data.governmentIds : [],
            jobTitles: data.role === AUTH_ROLES.SUPPLIER ? data.jobTitles : [],
            profilePicture: upload.secure_url,
            isEmailVerified: false,
            isPhoneVerified: true,
            isProfileComplete: false,
          },
          session,
        );

        emailOtp = generateOTP();

        responseData = {
          created: true,
          email: createdUser.email,
          firstName: createdUser.firstName,
          userId: createdUser._id.toString(),
        };
      });

      if (responseData?.reuseUnverified) {
        await saveEmailOTP(responseData.email, emailOtp!);

        await publishToQueue(AUTH_QUEUE_EVENTS.USER_REGISTERED, {
          userId: responseData.userId,
          email: responseData.email,
          firstName: responseData.firstName,
          otp: emailOtp,
          isResend: true,
        });

        return {
          success: true,
          message:
            "This email is already registered but not verified. A new verification code has been sent to your email.",
          requiresVerification: true,
          email: responseData.email,
        };
      }

      await saveEmailOTP(createdUser.email, emailOtp!);

      await publishToQueue(AUTH_QUEUE_EVENTS.USER_REGISTERED, {
        userId: createdUser._id.toString(),
        email: createdUser.email,
        firstName: createdUser.firstName,
        otp: emailOtp,
      });

      return {
        success: true,
        message:
          "Registration successful. Please check your email for verification code.",
        requiresVerification: true,
        email: createdUser.email,
      };
    } finally {
      await session.endSession();
    }
  }

  static async changePassword(input: {
    userId: string;
    currentPassword: string;
    newPassword: string;
    sessionId?: string;
  }) {
    const { userId, currentPassword, newPassword, sessionId } = input;

    const user = await UserRepository.findById(userId);
    if (!user) {
      throw new AppError("User not found", 404);
    }

    const isValid = await comparePassword(currentPassword, user.password);
    if (!isValid) {
      throw new AppError("Current password is incorrect", 400);
    }

    const samePassword = await comparePassword(newPassword, user.password);
    if (samePassword) {
      throw new AppError(
        "New password must be different from current password",
        400,
      );
    }

    const hashedPassword = await hashPassword(newPassword);

    await UserRepository.updateById(userId, {
      password: hashedPassword,
    });

    if (sessionId) {
      await AuthTokenService.revokeSession(userId, sessionId);
    }

    await publishToQueue(AUTH_QUEUE_EVENTS.EMAIL_JOBS, {
      type: "password_changed_email",
      to: user.email,
      data: {
        firstName: user.firstName,
      },
    });

    await publishNotification({
      userId,
      type: AUTH_NOTIFICATION_TYPES.PASSWORD_CHANGED,
      title: "Password Changed",
      message: "Your password was successfully changed.",
    });

    return {
      success: true,
      message: "Password changed successfully. Please log in again.",
    };
  }

  static async verifyEmailOTP(email: string, otp: string) {
    const attemptsKey = `otp:email:attempts:${email}`;
    const attempts = Number(await redis.get(attemptsKey)) || 0;

    if (attempts >= 5) {
      throw new AppError("Too many OTP attempts", 429);
    }

    const valid = await verifyEmailOTPUtil(email, otp);

    if (!valid) {
      await redis.incr(attemptsKey);
      await redis.expire(attemptsKey, 300);
      throw new AppError("Invalid OTP", 400);
    }

    await redis.del(attemptsKey);

    const existingUser = await UserRepository.findByEmail(email);
    if (!existingUser) {
      throw new AppError("User not found", 404);
    }

    const user = await UserRepository.updateById(existingUser._id, {
      isEmailVerified: true,
      isProfileComplete: true,
    });

    if (user) {
      await publishToQueue(AUTH_QUEUE_EVENTS.EMAIL_JOBS, {
        type: "welcome_email",
        to: user.email,
        data: { firstName: user.firstName },
      });

      await publishNotification({
        userId: user._id.toString(),
        type: AUTH_NOTIFICATION_TYPES.ACCOUNT_VERIFIED,
        title: "Account Verified 🎉",
        message: "Your email has been successfully verified.",
      });
    }

    return { success: true };
  }

  static async resendVerificationEmail(email: string) {
    if (!email) {
      throw new AppError("Email is required", 400);
    }

    const user = await UserRepository.findByEmail(email);

    if (!user) {
      return {
        success: true,
        message:
          "If your email is registered, a verification code will be sent",
      };
    }

    if (user.isEmailVerified) {
      throw new AppError("Email is already verified", 400);
    }

    const rateLimitKey = `resend:otp:${email}`;
    const requests = Number(await redis.get(rateLimitKey)) || 0;

    if (requests >= 3) {
      throw new AppError(
        "Too many resend attempts. Please try again later.",
        429,
      );
    }

    const emailOtp = generateOTP();
    await saveEmailOTP(user.email, emailOtp);

    await redis.incr(rateLimitKey);
    await redis.expire(rateLimitKey, 3600);

    await publishToQueue(AUTH_QUEUE_EVENTS.USER_REGISTERED, {
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

  static async login(email: string, password: string) {
    const normalizedEmail = email.toLowerCase().trim();
    const lockKey = `login:lock:${normalizedEmail}`;

    if (await redis.get(lockKey)) {
      throw new AppError("Account locked. Try later.", 429);
    }

    const user = await UserRepository.findByEmail(normalizedEmail);

    if (!user || !(await comparePassword(password, user.password))) {
      const attemptsKey = `login:attempts:${normalizedEmail}`;
      const attempts = Number(await redis.incr(attemptsKey));

      if (attempts >= 5) {
        await redis.set(lockKey, "1", "EX", 900);
      }

      await redis.expire(attemptsKey, 900);
      throw new AppError("Invalid credentials", 400);
    }

    if (!user.isEmailVerified) {
      const emailOtp = generateOTP();
      await saveEmailOTP(user.email, emailOtp);

      await publishToQueue(AUTH_QUEUE_EVENTS.EMAIL_JOBS, {
        type: "otp_email",
        to: user.email,
        data: { otp: emailOtp },
      });

      throw new AppError(
        "Email not verified. A new verification code has been sent.",
        403,
      );
    }

    await redis.del(`login:attempts:${normalizedEmail}`);

    if (!user.isProfileComplete) {
      throw new AppError("Account not verified", 403);
    }

    let category: any = null;
    let governments: any[] = [];

    if (user.governmentIds?.length > 0) {
      const govs = await GovernmentModel.find({
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

    if (user.role === AUTH_ROLES.SUPPLIER) {
      if (!user.categoryId) {
        throw new AppError("Supplier account missing category", 400);
      }

      const categoryDoc = await CategoryModel.findById(user.categoryId);
      if (!categoryDoc) {
        throw new AppError("User category not found", 400);
      }

      const categoryObj = categoryDoc.toObject();
      const { jobs, ...withoutJobs } = categoryObj;
      category = withoutJobs;
    }

    const tokens = await AuthTokenService.issueTokens(user);

    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      user: sanitizeUser(user),
      category,
      governments,
    };
  }

  static async refreshToken(refreshToken: string) {
    const decoded = verifyRefreshToken(refreshToken);
    const saved = await redis.get(
      `refresh:${decoded.userId}:${decoded.sessionId}`,
    );

    if (saved !== refreshToken) {
      throw new AppError("Invalid refresh token", 401);
    }

    const user = await UserRepository.findById(decoded.userId);
    if (!user) {
      throw new AppError("User not found", 404);
    }

    const tokens = await AuthTokenService.rotateRefreshToken(
      user,
      decoded.sessionId!,
      decoded.userId,
    );

    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
    };
  }

  static async logout(userId: string, sessionId: string, token: string) {
    await AuthTokenService.revokeSession(userId, sessionId);
    await AuthTokenService.blacklistAccessToken(token);

    return { success: true };
  }

  static async forgotPassword(email: string) {
    const user = await UserRepository.findByEmail(email);

    if (!user) {
      return {
        success: true,
        message:
          "If your email is registered, a password reset code will be sent",
      };
    }

    const rateLimitKey = `forgot:password:${email}`;
    const requests = Number(await redis.get(rateLimitKey)) || 0;

    if (requests >= 3) {
      throw new AppError(
        "Too many password reset attempts. Please try again later.",
        429,
      );
    }

    const resetOTP = generateOTP();
    const otpKey = `reset:password:otp:${email}`;

    await redis.set(
      otpKey,
      JSON.stringify({
        otp: resetOTP,
        userId: user._id.toString(),
        attempts: 0,
      }),
      "EX",
      900,
    );

    await redis.incr(rateLimitKey);
    await redis.expire(rateLimitKey, 3600);

    await publishToQueue(AUTH_QUEUE_EVENTS.EMAIL_JOBS, {
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

  static async verifyResetOTP(email: string, otp: string) {
    if (!email || !otp) {
      throw new AppError("Email and OTP are required", 400);
    }

    const otpKey = `reset:password:otp:${email}`;
    const otpDataStr = await redis.get(otpKey);

    if (!otpDataStr) {
      throw new AppError(
        "OTP has expired or is invalid. Please request a new one.",
        400,
      );
    }

    const otpData = JSON.parse(otpDataStr);

    if (otpData.attempts >= 5) {
      await redis.del(otpKey);
      throw new AppError(
        "Too many invalid attempts. Please request a new OTP.",
        429,
      );
    }

    if (otpData.otp !== otp) {
      otpData.attempts += 1;
      await redis.set(otpKey, JSON.stringify(otpData), "EX", 900);
      throw new AppError("Invalid OTP code", 400);
    }

    const resetToken = randomBytes(32).toString("hex");
    const hashedToken = createHash("sha256").update(resetToken).digest("hex");

    await redis.set(
      `reset:password:token:${hashedToken}`,
      otpData.userId,
      "EX",
      600,
    );

    await redis.del(otpKey);

    return {
      success: true,
      message: "OTP verified successfully",
      token: resetToken,
    };
  }

  static async resetPassword(token: string, password: string) {
    if (!token || !password) {
      throw new AppError("Token and new password are required", 400);
    }

    const hashedToken = createHash("sha256").update(token).digest("hex");
    const userId = await redis.get(`reset:password:token:${hashedToken}`);

    if (!userId) {
      throw new AppError("Invalid or expired reset token", 400);
    }

    const user = await UserRepository.updateById(userId, {
      password: await hashPassword(password),
    });

    if (!user) {
      throw new AppError("User not found", 404);
    }

    await redis.del(`reset:password:token:${hashedToken}`);

    await publishToQueue(AUTH_QUEUE_EVENTS.EMAIL_JOBS, {
      type: "password_changed_email",
      to: user.email,
      data: {
        firstName: user.firstName,
      },
    });

    await publishNotification({
      userId,
      type: AUTH_NOTIFICATION_TYPES.PASSWORD_CHANGED,
      title: "Password Changed",
      message: "Your password was successfully updated.",
    });

    return {
      success: true,
      message: "Password has been reset successfully",
    };
  }

  static async switchRole(input: {
    userId: string;
    currentRole: string;
    sessionId: string;
    targetRole: string;
    categoryId?: string;
    jobs?: string[];
    governmentIds?: string[];
  }) {
    const {
      userId,
      currentRole,
      sessionId,
      targetRole,
      categoryId,
      jobs,
      governmentIds,
    } = input;

    if (
      ![AUTH_ROLES.CUSTOMER, AUTH_ROLES.SUPPLIER].includes(targetRole as any)
    ) {
      throw new AppError("Invalid target role", 400);
    }

    if (currentRole === targetRole) {
      throw new AppError("You already have this role", 400);
    }

    const dbSession = await mongoose.startSession();
    let updatedUser: any = null;
    let categoryData: any = null;

    try {
      await dbSession.withTransaction(async () => {
        const user = await UserRepository.findById(userId, dbSession);
        if (!user) {
          throw new AppError("User not found", 404);
        }

        if (targetRole === AUTH_ROLES.SUPPLIER) {
          const finalCategoryId = user.categoryId || categoryId;
          if (!finalCategoryId) {
            throw new AppError("Category is required to become supplier", 400);
          }

          const category =
            await CategoryModel.findById(finalCategoryId).session(dbSession);
          if (!category) {
            throw new AppError("Invalid category", 400);
          }

          categoryData = category;

          const finalJobs =
            user.jobTitles?.length > 0 ? user.jobTitles : jobs || [];

          if (!Array.isArray(finalJobs) || finalJobs.length === 0) {
            throw new AppError(
              "At least one job title is required for supplier",
              400,
            );
          }

          const finalGovernmentIds =
            user.governmentIds?.length > 0
              ? user.governmentIds
              : governmentIds || [];

          if (
            !Array.isArray(finalGovernmentIds) ||
            finalGovernmentIds.length === 0
          ) {
            throw new AppError(
              "At least one government/service area is required for supplier",
              400,
            );
          }

          const governments = await GovernmentModel.find({
            _id: { $in: finalGovernmentIds },
          }).session(dbSession);

          if (governments.length !== finalGovernmentIds.length) {
            throw new AppError("One or more governments are invalid", 400);
          }

          user.categoryId = finalCategoryId as any;
          user.jobTitles = finalJobs;
          user.governmentIds = finalGovernmentIds as any;
        }

        user.role = targetRole as any;
        await user.save({ session: dbSession });
        updatedUser = user;
      });
    } finally {
      await dbSession.endSession();
    }

    await AuthTokenService.revokeSession(userId, sessionId);
    const tokens = await AuthTokenService.issueTokens(updatedUser);

    await publishNotification({
      userId,
      type: AUTH_NOTIFICATION_TYPES.ROLE_SWITCHED,
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
    if (targetRole === AUTH_ROLES.SUPPLIER && categoryData) {
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
