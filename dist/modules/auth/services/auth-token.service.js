"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthTokenService = void 0;
const crypto_1 = __importDefault(require("crypto"));
const redis_1 = __importDefault(require("../../../shared/config/redis"));
const token_1 = require("../../../shared/utils/token");
class AuthTokenService {
    static buildPayload(user, sessionId) {
        return {
            userId: user._id.toString(),
            role: user.role,
            name: `${user.firstName} ${user.lastName}`,
            categoryId: user.categoryId || null,
            governmentIds: user.governmentIds || [],
            sessionId,
        };
    }
    static async issueTokens(user) {
        const sessionId = crypto_1.default.randomUUID();
        const payload = this.buildPayload(user, sessionId);
        const accessToken = (0, token_1.generateToken)(payload);
        const refreshToken = (0, token_1.generateRefreshToken)(payload);
        await redis_1.default.set(`refresh:${user._id}:${sessionId}`, refreshToken, "EX", 7 * 24 * 60 * 60);
        return {
            sessionId,
            accessToken,
            refreshToken,
            payload,
        };
    }
    static async rotateRefreshToken(user, oldSessionId, userId) {
        const newSessionId = crypto_1.default.randomUUID();
        const payload = this.buildPayload(user, newSessionId);
        const accessToken = (0, token_1.generateToken)(payload);
        const refreshToken = (0, token_1.generateRefreshToken)(payload);
        await redis_1.default.set(`refresh:${userId}:${newSessionId}`, refreshToken, "EX", 7 * 24 * 60 * 60);
        await redis_1.default.del(`refresh:${userId}:${oldSessionId}`);
        return {
            sessionId: newSessionId,
            accessToken,
            refreshToken,
            payload,
        };
    }
    static async revokeSession(userId, sessionId) {
        await redis_1.default.del(`refresh:${userId}:${sessionId}`);
    }
    static async blacklistAccessToken(token, ttlSeconds = 900) {
        await redis_1.default.set(`bl:access:${token}`, "1", "EX", ttlSeconds);
    }
}
exports.AuthTokenService = AuthTokenService;
