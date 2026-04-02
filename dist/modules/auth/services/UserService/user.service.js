"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.UserService = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const user_repository_1 = require("../../repositories/user.repository");
const errorHandler_1 = require("../../../../shared/middlewares/errorHandler");
const sanitizeUser = (user) => {
    const obj = user.toObject ? user.toObject() : user;
    const { password, ...safeUser } = obj;
    return safeUser;
};
class UserService {
    static async getAllUsers() {
        const users = await user_repository_1.UserRepository.listUsers();
        return {
            count: users.length,
            data: users.map((u) => sanitizeUser(u)),
        };
    }
    static async getUserById(id) {
        if (!mongoose_1.default.Types.ObjectId.isValid(id)) {
            throw new errorHandler_1.AppError("Invalid user ID", 400);
        }
        const user = await user_repository_1.UserRepository.findById(id);
        if (!user) {
            throw new errorHandler_1.AppError("User not found", 404);
        }
        return {
            data: sanitizeUser(user),
        };
    }
    static async updateUser(id, payload) {
        if (!mongoose_1.default.Types.ObjectId.isValid(id)) {
            throw new errorHandler_1.AppError("Invalid user ID", 400);
        }
        const allowedFields = [
            "firstName",
            "lastName",
            "address",
            "profilePicture",
            "phoneNumber",
        ];
        const updates = {};
        for (const key of allowedFields) {
            if (payload[key] !== undefined) {
                updates[key] = payload[key];
            }
        }
        const user = await user_repository_1.UserRepository.updateById(id, updates);
        if (!user) {
            throw new errorHandler_1.AppError("User not found", 404);
        }
        return {
            message: "User updated successfully",
            data: sanitizeUser(user),
        };
    }
    static async deleteUser(id) {
        if (!mongoose_1.default.Types.ObjectId.isValid(id)) {
            throw new errorHandler_1.AppError("Invalid user ID", 400);
        }
        const user = await user_repository_1.UserRepository.deleteById(id);
        if (!user) {
            throw new errorHandler_1.AppError("User not found", 404);
        }
        return {
            message: "User deleted successfully",
        };
    }
}
exports.UserService = UserService;
