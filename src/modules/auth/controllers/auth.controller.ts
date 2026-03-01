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
import { sendEmailOTP } from "../../../shared/utils/emailService";
import redis from "../../../shared/config/redis";
import {
  generateRefreshToken,
  generateToken,
  verifyRefreshToken,
} from "../../../shared/utils/token";
import { publishNotification } from "../../notification/notification.publisher";
import CategoryModel from "../../category/models/Category.model";
import { publishToQueue } from "../../../shared/config/rabbitmq";

export const register = async (req: Request, res: Response) => {
  try {
    const data = req.body;

    const existingUser = await UserModel.findOne({
      $or: [{ email: data.email }, { phoneNumber: data.phoneNumber }],
    });

    if (existingUser) {
      throw new AppError("User already exists", 409);
    }

    if (data.role === "supplier") {
      if (!data.categoryId) {
        throw new AppError("Category is required for supplier", 400);
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

    console.log("✅ Message published successfully");

    res.status(201).json({ success: true });
  } catch (error: any) {
    res.status(error.statusCode || 500).json({
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
        "Email not verified. A new verification code has been sent to your email.",
        403,
      );
    }

    await redis.del(`login:attempts:${email}`);

    if (!user.isProfileComplete) {
      throw new AppError("Account not verified", 403);
    }

    let categoryData = null;

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
      role: user.role,
      name: `${user.firstName} ${user.lastName}`,
      categoryId: user.categoryId,
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

    res.json({
      accessToken,
      refreshToken,
      user: safeUser,
      categoryData,
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

  const newAccessToken = generateToken(decoded);
  res.json({ accessToken: newAccessToken });
};

export const logout = async (req: any, res: Response) => {
  const { userId, sessionId, token } = req.user;

  await redis.del(`refresh:${userId}:${sessionId}`);
  await redis.set(`bl:access:${token}`, "1", "EX", 900);

  res.json({ success: true });
};

export const forgotPassword = async (req: Request, res: Response) => {
  const { email } = req.body;

  const user = await UserModel.findOne({ email });
  if (!user) return res.json({ success: true });

  const resetToken = randomBytes(32).toString("hex");
  const hashedToken = createHash("sha256").update(resetToken).digest("hex");

  await redis.set(`reset:${hashedToken}`, user._id.toString(), "EX", 3600);
  await publishToQueue("email_jobs", {
    type: "reset_password_email",
    to: email,
    data: {
      token: resetToken,
    },
  });

  res.json({ success: true });
};

export const resetPassword = async (req: Request, res: Response) => {
  const { token, password } = req.body;

  const hashedToken = createHash("sha256").update(token).digest("hex");
  const userId = await redis.get(`reset:${hashedToken}`);

  if (!userId) throw new AppError("Invalid or expired token", 400);

  await UserModel.findByIdAndUpdate(userId, {
    password: await hashPassword(password),
  });

  await redis.del(`reset:${hashedToken}`);
  const updatedUser = await UserModel.findById(userId);

  await publishToQueue("email_jobs", {
    type: "password_changed_email",
    to: updatedUser!.email,
    data: {},
  });
  await publishNotification({
    userId: userId,
    type: "password_changed",
    title: "Password Changed",
    message: "Your password was successfully updated.",
  });

  res.json({ success: true });
};

export const switchRole = async (req: any, res: Response) => {
  const { userId, role, sessionId } = req.user;
  const { targetRole, categoryId } = req.body;

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
      await user.save();
    }
    console.log(user.categoryId);

    const category = await CategoryModel.findById(new mongoose.Types.ObjectId(user.categoryId.toString()));
    console.log("category", category);
    if (!category) {
      throw new AppError("Invalid category", 400);
    }

    categoryData = category;
  }

  user.role = targetRole;
  await user.save();

  await redis.del(`refresh:${userId}:${sessionId}`);

  const newSessionId = crypto.randomUUID();

  const payload = {
    userId: user._id.toString(),
    role: user.role,
    name: `${user.firstName} ${user.lastName}`,
    categoryId: user.categoryId,
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

  await publishNotification({
    userId: userId,
    type: "role_switched",
    title: "Role Updated",
    message: `Your account role is now ${targetRole}.`,
  });

  res.json({
    success: true,
    accessToken,
    refreshToken,
    user: safeUser,
    categoryData,
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
  res.status(200).json({ message: "User updated", data: safeUser });
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

// BIO Metrics Apis

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
    role: user.role,
    name: `${user.firstName} ${user.lastName}`,
    categoryId: user.categoryId,
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

export const updateUserRating = async (req: Request, res: Response) => {
  const { averageRating, totalReviews, review } = req.body;
  console.log("revewwwwwwwwww", review);

  const user = await UserModel.findById(req.params.id);
  if (!user) return res.status(404).json({ message: "User not found" });

  const reviewer = await UserModel.findById(review.reviewerId);

  user.averageRating = averageRating;
  user.totalReviews = totalReviews;

  user?.reviews?.push({
    reviewerId: review.reviewerId,
    reviewerName: reviewer
      ? `${reviewer.firstName} ${reviewer.lastName}`
      : "Unknown",
    rating: review.rating,
    comment: review.comment,
    createdAt: review.createdAt,
  });

  await user.save();
  res.json({ message: "User rating updated" });
};
