"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthDeviceService = void 0;
const errorHandler_1 = require("../../../../shared/middlewares/errorHandler");
const password_1 = require("../../../../shared/utils/password");
const notification_publisher_1 = require("../../../notification/notification.publisher");
const user_repository_1 = require("../../repositories/user.repository");
const auth_token_service_1 = require("../auth-token.service");
const auth_constants_1 = require("../../../../shared/constants/auth.constants");
const User_model_1 = __importDefault(require("../../models/User.model"));
const sanitizeUser = (user) => {
    const obj = user.toObject ? user.toObject() : user;
    const { password, ...safeUser } = obj;
    return safeUser;
};
class AuthDeviceService {
    static async registerDevice(input) {
        const { userId, deviceId, type, passcode } = input;
        const user = await user_repository_1.UserRepository.findById(userId);
        if (!user) {
            throw new errorHandler_1.AppError("User not found", 404);
        }
        const existing = user.biometrics?.find((d) => d.deviceId === deviceId);
        if (existing) {
            throw new errorHandler_1.AppError("Device already registered", 400);
        }
        const newDevice = { deviceId, type };
        if (type === auth_constants_1.BIOMETRIC_TYPES.PASSCODE) {
            if (!passcode) {
                throw new errorHandler_1.AppError("Passcode is required", 400);
            }
            newDevice.passcodeHash = await (0, password_1.hashPassword)(passcode);
        }
        const updated = await User_model_1.default.findOneAndUpdate({
            _id: userId,
            "biometrics.deviceId": { $ne: deviceId },
        }, {
            $push: { biometrics: newDevice },
        }, { new: true });
        if (!updated) {
            throw new errorHandler_1.AppError("Device already registered", 400);
        }
        await (0, notification_publisher_1.publishNotification)({
            userId,
            type: auth_constants_1.AUTH_NOTIFICATION_TYPES.DEVICE_REGISTERED,
            title: "New Device Registered",
            message: `A new ${type} login device was added to your account.`,
        });
        return {
            success: true,
            message: "Device registered for biometric login",
        };
    }
    static async biometricLogin(input) {
        const { deviceId, type, passcode } = input;
        const user = await user_repository_1.UserRepository.findByBiometricDevice(deviceId);
        if (!user) {
            throw new errorHandler_1.AppError("Device not registered", 404);
        }
        const device = user.biometrics?.find((d) => d.deviceId === deviceId && d.type === type);
        if (!device) {
            throw new errorHandler_1.AppError("Device or login type not allowed", 403);
        }
        if (type === auth_constants_1.BIOMETRIC_TYPES.PASSCODE) {
            if (!passcode) {
                throw new errorHandler_1.AppError("Passcode required", 400);
            }
            const valid = await (0, password_1.comparePassword)(passcode, device.passcodeHash);
            if (!valid) {
                throw new errorHandler_1.AppError("Invalid passcode", 403);
            }
        }
        const tokens = await auth_token_service_1.AuthTokenService.issueTokens(user);
        return {
            accessToken: tokens.accessToken,
            refreshToken: tokens.refreshToken,
            user: sanitizeUser(user),
        };
    }
    static async removeDevice(input) {
        const { userId, deviceId } = input;
        const user = await user_repository_1.UserRepository.findById(userId);
        if (!user) {
            throw new errorHandler_1.AppError("User not found", 404);
        }
        const updated = await User_model_1.default.findByIdAndUpdate(userId, {
            $pull: {
                biometrics: { deviceId },
            },
        }, { new: true });
        if (!updated) {
            throw new errorHandler_1.AppError("User not found", 404);
        }
        await (0, notification_publisher_1.publishNotification)({
            userId,
            type: auth_constants_1.AUTH_NOTIFICATION_TYPES.DEVICE_REMOVED,
            title: "Device Removed",
            message: "A biometric device was removed from your account.",
        });
        return {
            success: true,
            message: "Device removed successfully",
        };
    }
}
exports.AuthDeviceService = AuthDeviceService;
