"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.BundleService = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const User_model_1 = __importDefault(require("../../auth/models/User.model"));
const errorHandler_1 = require("../../../shared/middlewares/errorHandler");
const bundle_repository_1 = require("../repositories/bundle.repository");
const helpers_1 = require("../../../shared/utils/helpers");
class BundleService {
    static async getSupplierOrThrow(supplierId) {
        const supplier = await User_model_1.default.findById(supplierId);
        if (!supplier || supplier.role !== "supplier") {
            throw new errorHandler_1.AppError("Only suppliers can manage bundles", 403);
        }
        return supplier;
    }
    static normalizeStringArray(input) {
        if (!Array.isArray(input))
            return [];
        return input.map((item) => String(item).trim()).filter(Boolean);
    }
    static async buildManyBundlePayloads(bundleIds) {
        const payloads = await Promise.all(bundleIds.map((id) => (0, helpers_1.buildBundlePayload)(id)));
        return payloads.filter(Boolean);
    }
    static async createBundle(input) {
        const { supplierId, categoryId, governmentIds, title, subtitle, description, image, price, oldPrice, durationMinutes, includes, tags, } = input;
        const supplier = await this.getSupplierOrThrow(supplierId);
        const resolvedCategoryId = categoryId || String(supplier.categoryId || "");
        const resolvedGovernmentIds = Array.isArray(governmentIds) && governmentIds.length > 0
            ? governmentIds
            : (supplier.governmentIds || []).map(String);
        if (!resolvedCategoryId) {
            throw new errorHandler_1.AppError("Supplier category is required to create bundle", 400);
        }
        if (!resolvedGovernmentIds.length) {
            throw new errorHandler_1.AppError("At least one government is required to create bundle", 400);
        }
        if (oldPrice && oldPrice < price) {
            throw new errorHandler_1.AppError("oldPrice must be greater than or equal to price", 400);
        }
        const dbSession = await mongoose_1.default.startSession();
        let bundle;
        try {
            await dbSession.withTransaction(async () => {
                bundle = await bundle_repository_1.BundleRepository.createBundle({
                    supplierId,
                    categoryId: resolvedCategoryId,
                    governmentIds: resolvedGovernmentIds,
                    title: title.trim(),
                    subtitle: subtitle?.trim() || null,
                    description: description.trim(),
                    image: image?.trim() || null,
                    price,
                    oldPrice: oldPrice ?? null,
                    durationMinutes,
                    includes: this.normalizeStringArray(includes),
                    tags: this.normalizeStringArray(tags),
                    isActive: true,
                }, dbSession);
            });
        }
        finally {
            await dbSession.endSession();
        }
        const payload = await (0, helpers_1.buildBundlePayload)(bundle._id.toString());
        return {
            success: true,
            message: "Bundle created successfully",
            bundle: payload,
        };
    }
    static async getAllBundles(input) {
        const bundles = await bundle_repository_1.BundleRepository.findAllActive(input);
        const enriched = await this.buildManyBundlePayloads(bundles.map((bundle) => bundle._id.toString()));
        return {
            success: true,
            count: enriched.length,
            bundles: enriched,
        };
    }
    static async getBundleById(input) {
        const bundle = await (0, helpers_1.buildBundlePayload)(input.bundleId);
        if (!bundle) {
            throw new errorHandler_1.AppError("Bundle not found", 404);
        }
        return {
            success: true,
            bundle,
        };
    }
    static async getMyBundles(input) {
        await this.getSupplierOrThrow(input.supplierId);
        const bundles = await bundle_repository_1.BundleRepository.findBySupplierId(input.supplierId);
        const enriched = await this.buildManyBundlePayloads(bundles.map((bundle) => bundle._id.toString()));
        return {
            success: true,
            count: enriched.length,
            bundles: enriched,
        };
    }
    static async updateBundle(input) {
        const { supplierId, bundleId, updates } = input;
        await this.getSupplierOrThrow(supplierId);
        const existingBundle = await bundle_repository_1.BundleRepository.findByIdForSupplier(bundleId, supplierId);
        if (!existingBundle) {
            throw new errorHandler_1.AppError("Bundle not found", 404);
        }
        const allowedFields = [
            "title",
            "subtitle",
            "description",
            "image",
            "price",
            "oldPrice",
            "durationMinutes",
            "categoryId",
            "governmentIds",
            "includes",
            "tags",
            "isActive",
        ];
        const safeUpdate = {};
        for (const field of allowedFields) {
            if (updates[field] !== undefined) {
                safeUpdate[field] = updates[field];
            }
        }
        if (safeUpdate.title !== undefined)
            safeUpdate.title = String(safeUpdate.title).trim();
        if (safeUpdate.subtitle !== undefined)
            safeUpdate.subtitle = safeUpdate.subtitle
                ? String(safeUpdate.subtitle).trim()
                : null;
        if (safeUpdate.description !== undefined)
            safeUpdate.description = String(safeUpdate.description).trim();
        if (safeUpdate.image !== undefined)
            safeUpdate.image = safeUpdate.image
                ? String(safeUpdate.image).trim()
                : null;
        if (safeUpdate.includes !== undefined)
            safeUpdate.includes = this.normalizeStringArray(safeUpdate.includes);
        if (safeUpdate.tags !== undefined)
            safeUpdate.tags = this.normalizeStringArray(safeUpdate.tags);
        const nextPrice = safeUpdate.price ?? existingBundle.price;
        const nextOldPrice = safeUpdate.oldPrice !== undefined
            ? safeUpdate.oldPrice
            : existingBundle.oldPrice;
        if (nextOldPrice && nextOldPrice < nextPrice) {
            throw new errorHandler_1.AppError("oldPrice must be greater than or equal to price", 400);
        }
        const dbSession = await mongoose_1.default.startSession();
        let updatedBundle;
        try {
            await dbSession.withTransaction(async () => {
                updatedBundle = await bundle_repository_1.BundleRepository.updateBundle(bundleId, supplierId, safeUpdate, dbSession);
                if (!updatedBundle) {
                    throw new errorHandler_1.AppError("Bundle not found", 404);
                }
            });
        }
        finally {
            await dbSession.endSession();
        }
        const payload = await (0, helpers_1.buildBundlePayload)(updatedBundle._id.toString());
        return {
            success: true,
            message: "Bundle updated successfully",
            bundle: payload,
        };
    }
    static async toggleBundleStatus(input) {
        const { supplierId, bundleId } = input;
        await this.getSupplierOrThrow(supplierId);
        const bundle = await bundle_repository_1.BundleRepository.findByIdForSupplier(bundleId, supplierId);
        if (!bundle) {
            throw new errorHandler_1.AppError("Bundle not found", 404);
        }
        const updatedBundle = await bundle_repository_1.BundleRepository.toggleBundleStatus(bundleId, supplierId, !bundle.isActive);
        if (!updatedBundle) {
            throw new errorHandler_1.AppError("Bundle not found", 404);
        }
        const payload = await (0, helpers_1.buildBundlePayload)(updatedBundle._id.toString());
        return {
            success: true,
            message: `Bundle ${updatedBundle.isActive ? "activated" : "deactivated"} successfully`,
            bundle: payload,
        };
    }
    static async deleteBundle(input) {
        const { supplierId, bundleId } = input;
        await this.getSupplierOrThrow(supplierId);
        const dbSession = await mongoose_1.default.startSession();
        let deletedBundle;
        try {
            await dbSession.withTransaction(async () => {
                deletedBundle = await bundle_repository_1.BundleRepository.deleteBundle(bundleId, supplierId, dbSession);
                if (!deletedBundle) {
                    throw new errorHandler_1.AppError("Bundle not found", 404);
                }
            });
        }
        finally {
            await dbSession.endSession();
        }
        return {
            success: true,
            message: "Bundle deleted successfully",
            data: {
                deletedBundleId: deletedBundle._id.toString(),
            },
        };
    }
}
exports.BundleService = BundleService;
