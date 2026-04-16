import crypto from "crypto";
import redis from "../../../shared/config/redis";
import {
  generateRefreshToken,
  generateToken,
} from "../../../shared/utils/token";

export class AuthTokenService {
  static buildPayload(user: any, sessionId: string) {
    const governmentIds = Array.isArray(user.governments)
      ? user.governments.map((g: any) => g.governmentId)
      : user.governmentIds || [];

    return {
      userId: user.id,
      role: user.role,
      name: `${user.firstName} ${user.lastName}`,
      categoryId: user.categoryId || null,
      governmentIds,
      sessionId,
    };
  }

  static async issueTokens(user: any) {
    const sessionId = crypto.randomUUID();
    const payload = this.buildPayload(user, sessionId);

    const accessToken = generateToken(payload);
    const refreshToken = generateRefreshToken(payload);

    await redis.set(
      `refresh:${user.id}:${sessionId}`,
      refreshToken,
      "EX",
      7 * 24 * 60 * 60,
    );

    return {
      sessionId,
      accessToken,
      refreshToken,
      payload,
    };
  }

  static async rotateRefreshToken(
    user: any,
    oldSessionId: string,
    userId: string,
  ) {
    const newSessionId = crypto.randomUUID();
    const payload = this.buildPayload(user, newSessionId);

    const accessToken = generateToken(payload);
    const refreshToken = generateRefreshToken(payload);

    await redis.set(
      `refresh:${userId}:${newSessionId}`,
      refreshToken,
      "EX",
      7 * 24 * 60 * 60,
    );

    await redis.del(`refresh:${userId}:${oldSessionId}`);

    return {
      sessionId: newSessionId,
      accessToken,
      refreshToken,
      payload,
    };
  }

  static async revokeSession(userId: string, sessionId: string) {
    await redis.del(`refresh:${userId}:${sessionId}`);
  }

  static async blacklistAccessToken(token: string, ttlSeconds = 900) {
    await redis.set(`bl:access:${token}`, "1", "EX", ttlSeconds);
  }
}
