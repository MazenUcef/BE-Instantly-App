"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.GovernmentService = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const errorHandler_1 = require("../../../shared/middlewares/errorHandler");
const rabbitmq_1 = require("../../../shared/config/rabbitmq");
const government_constants_1 = require("../../../shared/constants/government.constants");
const government_repository_1 = require("../repository/government.repository");
const normalizeText = (value) => value.trim().toLowerCase().replace(/\s+/g, " ");
class GovernmentService {
    static async createGovernment(input) {
        const dbSession = await mongoose_1.default.startSession();
        let createdGovernment = null;
        try {
            await dbSession.withTransaction(async () => {
                const normalizedName = normalizeText(input.name);
                const normalizedNameAr = normalizeText(input.nameAr);
                const existingGovernment = await government_repository_1.GovernmentRepository.findByNormalizedNames(normalizedName, normalizedNameAr, dbSession);
                if (existingGovernment) {
                    throw new errorHandler_1.AppError("Government already exists", 409);
                }
                createdGovernment = await government_repository_1.GovernmentRepository.create({
                    name: input.name.trim(),
                    nameAr: input.nameAr.trim(),
                    normalizedName,
                    normalizedNameAr,
                    country: input.country?.trim() || "Egypt",
                    order: input.order ?? 0,
                    isActive: true,
                }, dbSession);
            });
        }
        finally {
            await dbSession.endSession();
        }
        await (0, rabbitmq_1.publishToQueue)(government_constants_1.GOVERNMENT_QUEUE_EVENTS.CREATED, {
            governmentId: createdGovernment._id.toString(),
            name: createdGovernment.name,
            nameAr: createdGovernment.nameAr,
            country: createdGovernment.country,
            order: createdGovernment.order,
        });
        return {
            success: true,
            message: "Government created successfully",
            data: createdGovernment,
        };
    }
    static async getAllGovernments() {
        const governments = await government_repository_1.GovernmentRepository.findActive();
        return {
            success: true,
            count: governments.length,
            data: governments,
        };
    }
    static async getAllGovernmentsAdmin() {
        const governments = await government_repository_1.GovernmentRepository.findAll();
        return {
            success: true,
            count: governments.length,
            data: governments,
        };
    }
    static async getGovernmentById(governmentId) {
        const government = await government_repository_1.GovernmentRepository.findById(governmentId);
        if (!government) {
            throw new errorHandler_1.AppError("Government not found", 404);
        }
        return {
            success: true,
            data: government,
        };
    }
    static async updateGovernment(governmentId, input) {
        const dbSession = await mongoose_1.default.startSession();
        let updatedGovernment = null;
        try {
            await dbSession.withTransaction(async () => {
                const government = await government_repository_1.GovernmentRepository.findById(governmentId, dbSession);
                if (!government) {
                    throw new errorHandler_1.AppError("Government not found", 404);
                }
                const updates = {};
                const nextName = input.name?.trim() ?? government.name;
                const nextNameAr = input.nameAr?.trim() ?? government.nameAr;
                const normalizedName = normalizeText(nextName);
                const normalizedNameAr = normalizeText(nextNameAr);
                if (normalizedName !== government.normalizedName ||
                    normalizedNameAr !== government.normalizedNameAr) {
                    const existing = await government_repository_1.GovernmentRepository.findByNormalizedNames(normalizedName, normalizedNameAr, dbSession);
                    if (existing && existing._id.toString() !== governmentId) {
                        throw new errorHandler_1.AppError("Government name already exists", 409);
                    }
                }
                if (input.name !== undefined) {
                    updates.name = nextName;
                    updates.normalizedName = normalizedName;
                }
                if (input.nameAr !== undefined) {
                    updates.nameAr = nextNameAr;
                    updates.normalizedNameAr = normalizedNameAr;
                }
                if (input.country !== undefined) {
                    updates.country = input.country.trim();
                }
                if (input.order !== undefined) {
                    updates.order = input.order;
                }
                if (input.isActive !== undefined) {
                    updates.isActive = input.isActive;
                }
                updatedGovernment = await government_repository_1.GovernmentRepository.updateById(governmentId, updates, dbSession);
            });
        }
        finally {
            await dbSession.endSession();
        }
        await (0, rabbitmq_1.publishToQueue)(government_constants_1.GOVERNMENT_QUEUE_EVENTS.UPDATED, {
            governmentId: updatedGovernment._id.toString(),
            name: updatedGovernment.name,
            nameAr: updatedGovernment.nameAr,
            country: updatedGovernment.country,
            order: updatedGovernment.order,
            isActive: updatedGovernment.isActive,
        });
        return {
            success: true,
            message: "Government updated successfully",
            data: updatedGovernment,
        };
    }
    static async deleteGovernment(governmentId) {
        const government = await government_repository_1.GovernmentRepository.findById(governmentId);
        if (!government) {
            throw new errorHandler_1.AppError("Government not found", 404);
        }
        if (!government.isActive) {
            throw new errorHandler_1.AppError("Government is already inactive", 400);
        }
        const updatedGovernment = await government_repository_1.GovernmentRepository.updateById(governmentId, {
            isActive: false,
        });
        await (0, rabbitmq_1.publishToQueue)(government_constants_1.GOVERNMENT_QUEUE_EVENTS.DEACTIVATED, {
            governmentId: updatedGovernment._id.toString(),
            name: updatedGovernment.name,
            nameAr: updatedGovernment.nameAr,
            isActive: updatedGovernment.isActive,
        });
        return {
            success: true,
            message: "Government deactivated successfully",
        };
    }
    static async toggleGovernmentStatus(governmentId) {
        const government = await government_repository_1.GovernmentRepository.findById(governmentId);
        if (!government) {
            throw new errorHandler_1.AppError("Government not found", 404);
        }
        const updatedGovernment = await government_repository_1.GovernmentRepository.updateById(governmentId, {
            isActive: !government.isActive,
        });
        await (0, rabbitmq_1.publishToQueue)(updatedGovernment.isActive
            ? government_constants_1.GOVERNMENT_QUEUE_EVENTS.ACTIVATED
            : government_constants_1.GOVERNMENT_QUEUE_EVENTS.DEACTIVATED, {
            governmentId: updatedGovernment._id.toString(),
            name: updatedGovernment.name,
            nameAr: updatedGovernment.nameAr,
            isActive: updatedGovernment.isActive,
        });
        return {
            success: true,
            message: `Government ${updatedGovernment.isActive ? "activated" : "deactivated"} successfully`,
            data: updatedGovernment,
        };
    }
}
exports.GovernmentService = GovernmentService;
