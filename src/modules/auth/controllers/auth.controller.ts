import { Request, Response } from "express";
import mongoose, { Types } from "mongoose";
import UserModel from "../models/User.model";
import { randomBytes, createHash } from "crypto";
import crypto from "crypto";
import { AppError } from "../../../shared/middlewares/errorHandler";
import { validateFile } from "../../../shared/utils/helpers";
import { uploadToCloudinary } from "../../../shared/utils/cloudinary";
import { comparePassword, hashPassword } from "../../../shared/utils/password";
import {
  generateOTP,
  saveEmailOTP,
  verifyEmailOTPUtil,
} from "../../../shared/utils/otp";
import redis from "../../../shared/config/redis";
import {
  generateRefreshToken,
  generateToken,
  verifyRefreshToken,
} from "../../../shared/utils/token";
import { publishNotification } from "../../notification/notification.publisher";
import CategoryModel from "../../category/models/Category.model";
import { publishToQueue } from "../../../shared/config/rabbitmq";
import GovernmentModel from "../../government/models/Government.model";

export const register = async (req: Request, res: Response) => {
  try {
    console.log("req.body:", req.body);
    console.log("req.files:", req.files);
    const data = req.body;
    console.log("data", data);
    const existingUser = await UserModel.findOne({
      $or: [{ email: data.email }, { phoneNumber: data.phoneNumber }],
    });

    if (existingUser) {
      if (existingUser.email === data.email) {
        if (existingUser.isEmailVerified) {
          throw new AppError("User already exists", 409);
        }

        const emailOtp = generateOTP();
        await saveEmailOTP(existingUser.email, emailOtp);

        await publishToQueue("USER_REGISTERED", {
          userId: existingUser._id.toString(),
          email: existingUser.email,
          firstName: existingUser.firstName,
          otp: emailOtp,
          isResend: true,
        });

        return res.status(200).json({
          success: true,
          message:
            "This email is already registered but not verified. A new verification code has been sent to your email.",
          requiresVerification: true,
          email: existingUser.email,
        });
      }

      if (existingUser.phoneNumber === data.phoneNumber) {
        throw new AppError("Phone number already registered", 409);
      }
    }

    if (!data.address) {
      throw new AppError("Address is required", 400);
    }

    if (data.role === "supplier") {
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

      const governments = await GovernmentModel.find({
        _id: { $in: data.governmentIds },
      });

      if (governments.length !== data.governmentIds.length) {
        throw new AppError("One or more governments are invalid", 400);
      }

      const category = await CategoryModel.findById(data.categoryId);
      if (!category) {
        throw new AppError("Invalid category", 400);
      }
    }

    const files = req.files as any;

    if (!files?.profilePicture?.[0]) {
      throw new AppError("Profile picture is required", 400);
    }

    validateFile(files.profilePicture[0]);
    const profilePictureUpload = await uploadToCloudinary(
      files.profilePicture[0],
    );

    const user = await UserModel.create({
      ...data,
      password: await hashPassword(data.password),
      categoryId: data.role === "supplier" ? data.categoryId : null,
      jobTitles: data.role === "supplier" ? data.jobTitles : [],
      governmentIds: data.role === "supplier" ? data.governmentIds : [],
      profilePicture: profilePictureUpload.secure_url,
      isEmailVerified: false,
      isPhoneVerified: true,
      isProfileComplete: false,
    });

    const emailOtp = generateOTP();
    await saveEmailOTP(user.email, emailOtp);

    console.log("📤 Publishing to USER_REGISTERED queue:", {
      userId: user._id.toString(),
      email: user.email,
      otp: emailOtp,
    });

    await publishToQueue("USER_REGISTERED", {
      userId: user._id.toString(),
      email: user.email,
      firstName: user.firstName,
      otp: emailOtp,
    });

    res.status(201).json({
      success: true,
      message:
        "Registration successful. Please check your email for verification code.",
      requiresVerification: true,
      email: user.email,
    });
  } catch (error: any) {
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

export const verifyEmailOTP = async (req: Request, res: Response) => {
  const { email, otp } = req.body;

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

  const user = await UserModel.findOneAndUpdate(
    { email },
    { isEmailVerified: true, isProfileComplete: true },
    { new: true },
  );

  if (user) {
    await publishToQueue("email_jobs", {
      type: "welcome_email",
      to: user.email,
      data: {
        firstName: user.firstName,
      },
    });
    await publishNotification({
      userId: user._id.toString(),
      type: "account_verified",
      title: "Account Verified 🎉",
      message: "Your email has been successfully verified.",
    });
  }

  res.json({ success: true });
};

export const login = async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    const lockKey = `login:lock:${email}`;
    if (await redis.get(lockKey)) {
      throw new AppError("Account locked. Try later.", 429);
    }

    const user = await UserModel.findOne({ email });
    if (!user || !(await comparePassword(password, user.password))) {
      const attemptsKey = `login:attempts:${email}`;
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
      await publishToQueue("email_jobs", {
        type: "otp_email",
        to: user.email,
        data: {
          otp: emailOtp,
        },
      });

      throw new AppError(
        "Email not verified. we have been sent a new email.",
        403,
      );
    }

    await redis.del(`login:attempts:${email}`);

    if (!user.isProfileComplete) {
      throw new AppError("Account not verified", 403);
    }

    let categoryData = null;
    let governmentsData: any[] = [];

    if (user.governmentIds && user.governmentIds.length > 0) {
      const governmentObjectIds = user.governmentIds.map(
        (id) => new mongoose.Types.ObjectId(id.toString()),
      );

      const governments = await GovernmentModel.find({
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
        throw new AppError("Supplier account missing category", 400);
      }

      const category = await CategoryModel.findById(
        new mongoose.Types.ObjectId(user.categoryId.toString()),
      );
      if (!category) {
        throw new AppError("User category not found", 400);
      }

      categoryData = category;
    }

    const sessionId = crypto.randomUUID();

    const payload = {
      userId: user._id.toString(),
      email: user.email,
      role: user.role,
      name: `${user.firstName} ${user.lastName}`,
      categoryId: user.categoryId,
      governmentIds: user.governmentIds,
      sessionId,
    };

    const accessToken = generateToken(payload);
    const refreshToken = generateRefreshToken(payload);

    await redis.set(
      `refresh:${user._id}:${sessionId}`,
      refreshToken,
      "EX",
      7 * 24 * 60 * 60,
    );

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
  } catch (error: any) {
    res.status(error.statusCode || 500).json({
      message: error.message,
    });
  }
};

export const refreshToken = async (req: Request, res: Response) => {
  const { refreshToken } = req.body;

  const decoded = verifyRefreshToken(refreshToken);
  const saved = await redis.get(
    `refresh:${decoded.userId}:${decoded.sessionId}`,
  );

  if (saved !== refreshToken) {
    throw new AppError("Invalid refresh token", 401);
  }

  const user = await UserModel.findById(decoded.userId);
  if (!user) throw new AppError("User not found", 404);

  const newSessionId = crypto.randomUUID();
  const payload = {
    userId: user._id.toString(),
    email: user.email,
    role: user.role,
    name: `${user.firstName} ${user.lastName}`,
    governmentIds: user.governmentIds,
    categoryId: user.categoryId,
    sessionId: newSessionId,
  };

  const newAccessToken = generateToken(payload);
  const newRefreshToken = generateRefreshToken(payload);

  await redis.set(
    `refresh:${decoded.userId}:${newSessionId}`,
    newRefreshToken,
    "EX",
    7 * 24 * 60 * 60,
  );

  await redis.del(`refresh:${decoded.userId}:${decoded.sessionId}`);

  res.json({
    accessToken: newAccessToken,
    refreshToken: newRefreshToken,
  });
};

export const logout = async (req: any, res: Response) => {
  const { userId, sessionId, token } = req.user;

  await redis.del(`refresh:${userId}:${sessionId}`);
  await redis.set(`bl:access:${token}`, "1", "EX", 900);

  res.json({ success: true });
};

export const forgotPassword = async (req: Request, res: Response) => {
  try {
    const { email } = req.body;

    const user = await UserModel.findOne({ email });
    if (!user) {
      return res.json({
        success: true,
        message:
          "If your email is registered, a password reset code will be sent",
      });
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

    await publishToQueue("email_jobs", {
      type: "password_reset_otp",
      to: email,
      data: {
        otp: resetOTP,
        firstName: user.firstName,
      },
    });

    console.log(" Password reset OTP sent to:", { email, otp: resetOTP });

    res.json({
      success: true,
      message: "Password reset code has been sent to your email",
      email: email,
    });
  } catch (error: any) {
    console.error("Error in forgotPassword:", error);
    res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || "Failed to process password reset request",
    });
  }
};

export const verifyResetOTP = async (req: Request, res: Response) => {
  try {
    const { email, otp } = req.body;

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

    res.json({
      success: true,
      message: "OTP verified successfully",
      token: resetToken,
    });
  } catch (error: any) {
    console.error("Error in verifyResetOTP:", error);
    res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || "Failed to verify OTP",
    });
  }
};

export const resetPassword = async (req: Request, res: Response) => {
  try {
    const { token, password } = req.body;

    if (!token || !password) {
      throw new AppError("Token and new password are required", 400);
    }

    const hashedToken = createHash("sha256").update(token).digest("hex");
    const userId = await redis.get(`reset:password:token:${hashedToken}`);

    if (!userId) {
      throw new AppError("Invalid or expired reset token", 400);
    }

    const user = await UserModel.findByIdAndUpdate(
      userId,
      { password: await hashPassword(password) },
      { new: true },
    );

    if (!user) {
      throw new AppError("User not found", 404);
    }

    await redis.del(`reset:password:token:${hashedToken}`);

    await publishToQueue("email_jobs", {
      type: "password_changed_email",
      to: user.email,
      data: {
        firstName: user.firstName,
      },
    });

    await publishNotification({
      userId: userId,
      type: "password_changed",
      title: "Password Changed",
      message: "Your password was successfully updated.",
    });

    res.json({
      success: true,
      message: "Password has been reset successfully",
    });
  } catch (error: any) {
    console.error("Error in resetPassword:", error);
    res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || "Failed to reset password",
    });
  }
};

export const resendVerificationEmail = async (req: Request, res: Response) => {
  try {
    const { email } = req.body;

    if (!email) {
      throw new AppError("Email is required", 400);
    }

    const user = await UserModel.findOne({ email });
    if (!user) {
      return res.json({
        success: true,
        message:
          "If your email is registered, a verification code will be sent",
      });
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

    console.log(" Resending verification email to:", {
      userId: user._id.toString(),
      email: user.email,
      otp: emailOtp,
    });

    await publishToQueue("USER_REGISTERED", {
      userId: user._id.toString(),
      email: user.email,
      firstName: user.firstName,
      otp: emailOtp,
      isResend: true,
    });

    console.log(" Resend verification email published successfully");

    res.json({
      success: true,
      message: "Verification email has been resent successfully",
    });
  } catch (error: any) {
    console.error("Error in resendVerificationEmail:", error);
    res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || "Failed to resend verification email",
    });
  }
};

export const switchRole = async (req: any, res: Response) => {
  console.log("switchRole - req.user:", req.user);
  console.log("switchRole - req.body:", req.body);
  console.log(
    "switchRole - req.headers.content-type:",
    req.headers["content-type"],
  );
  const { userId, role, sessionId } = req.user;
  const { targetRole, categoryId, jobs, governmentIds } = req.body;
  console.log("req.body", req.body);

  if (!["customer", "supplier"].includes(targetRole)) {
    throw new AppError("Invalid target role", 400);
  }

  if (role === targetRole) {
    throw new AppError("You already have this role", 400);
  }

  const user = await UserModel.findById(userId);
  if (!user) throw new AppError("User not found", 404);

  let categoryData = null;

  if (targetRole === "supplier") {
    if (!user.categoryId) {
      if (!categoryId) {
        throw new AppError("Category is required to become supplier", 400);
      }
      user.categoryId = categoryId;
    }

    const category = await CategoryModel.findById(
      new mongoose.Types.ObjectId(user.categoryId.toString()),
    );
    if (!category) {
      throw new AppError("Invalid category", 400);
    }
    categoryData = category;

    if (!user.jobTitles || user.jobTitles.length === 0) {
      if (!Array.isArray(jobs) || jobs.length === 0) {
        throw new AppError(
          "At least one job title is required for supplier",
          400,
        );
      }
      user.jobTitles = jobs;
    }

    if (!user.governmentIds || user.governmentIds.length === 0) {
      if (!Array.isArray(governmentIds) || governmentIds.length === 0) {
        throw new AppError(
          "At least one government/service area is required for supplier",
          400,
        );
      }
      const governments = await GovernmentModel.find({
        _id: { $in: governmentIds },
      });

      if (governments.length !== governmentIds.length) {
        throw new AppError("One or more governments are invalid", 400);
      }

      user.governmentIds = governmentIds;
    }
  }

  user.role = targetRole;
  await user.save();

  await redis.del(`refresh:${userId}:${sessionId}`);
  const newSessionId = crypto.randomUUID();

  const payload = {
    userId: user._id.toString(),
    email: user.email,
    role: user.role,
    name: `${user.firstName} ${user.lastName}`,
    categoryId: user.categoryId,
    governmentIds: user.governmentIds,
    sessionId: newSessionId,
  };

  const accessToken = generateToken(payload);
  const refreshToken = generateRefreshToken(payload);

  await redis.set(
    `refresh:${user._id}:${newSessionId}`,
    refreshToken,
    "EX",
    7 * 24 * 60 * 60,
  );

  const userObj = user.toObject();
  const { password: _, ...safeUser } = userObj;

  if (targetRole === "supplier" && categoryData) {
    const categoryObj = categoryData.toObject();
    const { jobs: _, ...categoryWithoutJobs } = categoryObj;
    categoryData = categoryWithoutJobs;
  }

  await publishNotification({
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

export const getAllUsers = async (_req: Request, res: Response) => {
  const users = await UserModel.find().sort({ createdAt: -1 });
  const safeUsers = users.map((u) => {
    const { password, ...rest } = u.toObject();
    return rest;
  });

  res.status(200).json({
    count: safeUsers.length,
    data: safeUsers,
  });
};

export const getUserById = async (req: Request, res: Response) => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

  if (!Types.ObjectId.isValid(id)) {
    return res.status(400).json({ message: "Invalid user ID" });
  }

  const user = await UserModel.findById(id);
  if (!user) {
    return res.status(404).json({ message: "User not found" });
  }

  const { password, ...safeUser } = user.toObject();
  res.status(200).json({ data: safeUser });
};

export const updateUser = async (req: Request, res: Response) => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const updates = req.body;

  if (!Types.ObjectId.isValid(id)) {
    return res.status(400).json({ message: "Invalid user ID" });
  }

  const user = await UserModel.findById(id);
  if (!user) return res.status(404).json({ message: "User not found" });

  if (updates.password) delete updates.password;

  Object.assign(user, updates);
  await user.save();

  const { password, ...safeUser } = user.toObject();
  res
    .status(200)
    .json({ message: "User updated successfully", data: safeUser });
};

export const deleteUser = async (req: Request, res: Response) => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

  if (!Types.ObjectId.isValid(id)) {
    return res.status(400).json({ message: "Invalid user ID" });
  }

  const user = await UserModel.findById(id);
  if (!user) return res.status(404).json({ message: "User not found" });

  await user.deleteOne();

  res.status(200).json({ message: "User deleted successfully" });
};

export const registerDevice = async (req: any, res: Response) => {
  const { deviceId, type, passcode } = req.body;
  const { userId } = req.user;

  const user = await UserModel.findById(userId);
  if (!user) throw new AppError("User not found", 404);

  const existingDevice = user.biometrics?.find((d) => d.deviceId === deviceId);
  if (existingDevice) throw new AppError("Device already registered", 400);

  const newDevice: any = { deviceId, type };
  if (type === "passcode") {
    const hashed = await hashPassword(passcode);
    newDevice.passcodeHash = hashed;
  }

  user?.biometrics?.push(newDevice);
  await user.save();
  await publishNotification({
    userId: userId,
    type: "device_registered",
    title: "New Device Registered",
    message: `A new ${type} login device was added to your account.`,
  });
  res.status(200).json({ message: "Device registered for biometric login" });
};

export const biometricLogin = async (req: Request, res: Response) => {
  const { deviceId, type, passcode } = req.body;

  const user = await UserModel.findOne({ "biometrics.deviceId": deviceId });
  if (!user) throw new AppError("Device not registered", 404);

  const device = user?.biometrics?.find(
    (d) => d.deviceId === deviceId && d.type === type,
  );
  if (!device) throw new AppError("Device or login type not allowed", 403);

  if (type === "passcode") {
    if (!passcode) throw new AppError("Passcode required", 400);
    const valid = await comparePassword(passcode, device.passcodeHash!);
    if (!valid) throw new AppError("Invalid passcode", 403);
  }

  const sessionId = crypto.randomUUID();
  const payload = {
    userId: user._id.toString(),
    email: user.email,
    role: user.role,
    name: `${user.firstName} ${user.lastName}`,
    categoryId: user.categoryId,
    governmentIds: user.governmentIds,
    sessionId,
  };
  const accessToken = generateToken(payload);
  const refreshToken = generateRefreshToken(payload);

  await redis.set(
    `refresh:${user._id}:${sessionId}`,
    refreshToken,
    "EX",
    7 * 24 * 60 * 60,
  );

  const userObj = user.toObject();
  const { password: _, ...safeUser } = userObj;

  res.json({ accessToken, refreshToken, user: safeUser });
};

export const removeDevice = async (req: any, res: Response) => {
  const { deviceId } = req.body;
  const { userId } = req.user;

  const user = await UserModel.findById(userId);
  if (!user) throw new AppError("User not found", 404);

  user.biometrics = user?.biometrics?.filter((d) => d.deviceId !== deviceId);
  await user.save();

  await publishNotification({
    userId: userId,
    type: "device_removed",
    title: "Device Removed",
    message: "A biometric device was removed from your account.",
  });

  res.json({ message: "Device removed successfully" });
};
