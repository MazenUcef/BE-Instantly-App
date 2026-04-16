import prisma from "../../../../shared/config/prisma";
import { BiometricType } from "@prisma/client";
import { AppError } from "../../../../shared/middlewares/errorHandler";
import { comparePassword, hashPassword } from "../../../../shared/utils/password";
import { publishNotification } from "../../../notification/notification.publisher";
import { UserRepository } from "../../repositories/user.repository";
import { AuthTokenService } from "../auth-token.service";
import {
  AUTH_NOTIFICATION_TYPES,
  BIOMETRIC_TYPES,
} from "../../../../shared/constants/auth.constants";

const sanitizeUser = (user: any) => {
  const { password, governments, ...rest } = user;
  return {
    ...rest,
    governmentIds: Array.isArray(governments)
      ? governments.map((g: any) => g.governmentId)
      : [],
  };
};

export class AuthDeviceService {
  static async registerDevice(input: {
    userId: string;
    deviceId: string;
    type: string;
    passcode?: string;
  }) {
    const { userId, deviceId, type, passcode } = input;

    const user = await UserRepository.findById(userId);
    if (!user) throw new AppError("User not found", 404);

    const existing = user.biometrics?.find((d: any) => d.deviceId === deviceId);
    if (existing) throw new AppError("Device already registered", 400);

    let passcodeHash: string | null = null;
    if (type === BIOMETRIC_TYPES.PASSCODE) {
      if (!passcode) throw new AppError("Passcode is required", 400);
      passcodeHash = await hashPassword(passcode);
    }

    await prisma.userBiometric.create({
      data: {
        userId,
        deviceId,
        type: type as BiometricType,
        passcodeHash,
      },
    });

    await publishNotification({
      userId,
      type: AUTH_NOTIFICATION_TYPES.DEVICE_REGISTERED,
      title: "New Device Registered",
      message: `A new ${type} login device was added to your account.`,
    });

    return { success: true, message: "Device registered for biometric login" };
  }

  static async biometricLogin(input: {
    deviceId: string;
    type: string;
    passcode?: string;
  }) {
    const { deviceId, type, passcode } = input;

    const user = await UserRepository.findByBiometricDevice(deviceId);
    if (!user) throw new AppError("Device not registered", 404);

    const device = user.biometrics?.find(
      (d: any) => d.deviceId === deviceId && d.type === type,
    );
    if (!device) throw new AppError("Device or login type not allowed", 403);

    if (type === BIOMETRIC_TYPES.PASSCODE) {
      if (!passcode) throw new AppError("Passcode required", 400);
      const valid = await comparePassword(passcode, device.passcodeHash!);
      if (!valid) throw new AppError("Invalid passcode", 403);
    }

    const tokens = await AuthTokenService.issueTokens(user);

    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      user: sanitizeUser(user),
    };
  }

  static async removeDevice(input: { userId: string; deviceId: string }) {
    const { userId, deviceId } = input;

    const user = await UserRepository.findById(userId);
    if (!user) throw new AppError("User not found", 404);

    await prisma.userBiometric.deleteMany({ where: { userId, deviceId } });

    await publishNotification({
      userId,
      type: AUTH_NOTIFICATION_TYPES.DEVICE_REMOVED,
      title: "Device Removed",
      message: "A biometric device was removed from your account.",
    });

    return { success: true, message: "Device removed successfully" };
  }
}
