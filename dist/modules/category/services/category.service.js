"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CategoryService = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const errorHandler_1 = require("../../../shared/middlewares/errorHandler");
const category_repository_1 = require("../repositories/category.repository");
const cloudinary_1 = require("../../../shared/utils/cloudinary");
const helpers_1 = require("../../../shared/utils/helpers");
const rabbitmq_1 = require("../../../shared/config/rabbitmq");
const category_constants_1 = require("../../../shared/constants/category.constants");
const normalizeCategoryName = (name) => name.trim().toLowerCase().replace(/\s+/g, " ");
const normalizeJobs = (jobs) => {
    if (!Array.isArray(jobs))
        return [];
    const cleaned = jobs
        .map((job) => String(job).trim())
        .filter(Boolean);
    return Array.from(new Set(cleaned));
};
const normalizeWorkflows = (workflows) => {
    if (!Array.isArray(workflows))
        return [];
    const normalized = workflows.map((w) => ({
        key: String(w.key ?? "").trim().toLowerCase().replace(/\s+/g, "_"),
        label: String(w.label ?? "").trim(),
        steps: Array.isArray(w.steps)
            ? Array.from(new Set(w.steps
                .map((s) => String(s).trim().toLowerCase().replace(/\s+/g, "_"))
                .filter(Boolean)))
            : [],
    }));
    const keys = normalized.map((w) => w.key);
    if (new Set(keys).size !== keys.length) {
        throw new errorHandler_1.AppError("Workflow keys must be unique within a category", 400);
    }
    return normalized;
};
class CategoryService {
    static async createCategory(req) {
        const dbSession = await mongoose_1.default.startSession();
        let createdCategory = null;
        try {
            await dbSession.withTransaction(async () => {
                const files = req.files;
                const { name, description } = req.body;
                const jobs = normalizeJobs(req.body.jobs);
                const workflows = normalizeWorkflows(req.body.workflows);
                const normalizedName = normalizeCategoryName(name);
                const existingCategory = await category_repository_1.CategoryRepository.findByNormalizedName(normalizedName, dbSession);
                if (existingCategory) {
                    throw new errorHandler_1.AppError("Category already exists", 409);
                }
                let imageUrl = null;
                if (files?.image?.[0]) {
                    (0, helpers_1.validateFile)(files.image[0]);
                    const upload = await (0, cloudinary_1.uploadToCloudinary)(files.image[0]);
                    imageUrl = upload.secure_url;
                }
                else if (req.body.image) {
                    imageUrl = req.body.image;
                }
                else {
                    throw new errorHandler_1.AppError("Category image is required", 400);
                }
                createdCategory = await category_repository_1.CategoryRepository.create({
                    name: name.trim(),
                    normalizedName,
                    description: description?.trim?.() || null,
                    image: imageUrl,
                    jobs,
                    workflows,
                    isActive: true,
                }, dbSession);
            });
        }
        finally {
            await dbSession.endSession();
        }
        await (0, rabbitmq_1.publishToQueue)(category_constants_1.CATEGORY_QUEUE_EVENTS.CREATED, {
            categoryId: createdCategory._id.toString(),
            name: createdCategory.name,
            description: createdCategory.description,
            image: createdCategory.image,
            jobs: createdCategory.jobs,
        });
        return {
            success: true,
            message: "Category created successfully",
            data: createdCategory,
        };
    }
    static async getAllCategories(includeInactive = false) {
        const categories = includeInactive
            ? await category_repository_1.CategoryRepository.findAll()
            : await category_repository_1.CategoryRepository.findActive();
        return {
            success: true,
            count: categories.length,
            data: categories,
        };
    }
    static async getCategoryById(categoryId) {
        const category = await category_repository_1.CategoryRepository.findById(categoryId);
        if (!category) {
            throw new errorHandler_1.AppError("Category not found", 404);
        }
        return {
            success: true,
            data: category,
        };
    }
    static async updateCategory(req) {
        const categoryId = req.params.id;
        const files = req.files;
        const dbSession = await mongoose_1.default.startSession();
        let updatedCategory = null;
        try {
            await dbSession.withTransaction(async () => {
                const category = await category_repository_1.CategoryRepository.findById(categoryId, dbSession);
                if (!category) {
                    throw new errorHandler_1.AppError("Category not found", 404);
                }
                const updates = {};
                if (req.body.name !== undefined) {
                    const trimmedName = req.body.name.trim();
                    const normalizedName = normalizeCategoryName(trimmedName);
                    if (normalizedName !== category.normalizedName) {
                        const existingCategory = await category_repository_1.CategoryRepository.findByNormalizedName(normalizedName, dbSession);
                        if (existingCategory && existingCategory._id.toString() !== categoryId) {
                            throw new errorHandler_1.AppError("Category name already exists", 409);
                        }
                    }
                    updates.name = trimmedName;
                    updates.normalizedName = normalizedName;
                }
                if (req.body.description !== undefined) {
                    updates.description = req.body.description?.trim?.() || null;
                }
                if (req.body.jobs !== undefined) {
                    updates.jobs = normalizeJobs(req.body.jobs);
                }
                if (req.body.workflows !== undefined) {
                    updates.workflows = normalizeWorkflows(req.body.workflows);
                }
                if (files?.image?.[0]) {
                    (0, helpers_1.validateFile)(files.image[0]);
                    const upload = await (0, cloudinary_1.uploadToCloudinary)(files.image[0]);
                    updates.image = upload.secure_url;
                }
                else if (req.body.image !== undefined) {
                    updates.image = req.body.image || null;
                }
                updatedCategory = await category_repository_1.CategoryRepository.updateById(categoryId, updates, dbSession);
            });
        }
        finally {
            await dbSession.endSession();
        }
        await (0, rabbitmq_1.publishToQueue)(category_constants_1.CATEGORY_QUEUE_EVENTS.UPDATED, {
            categoryId: updatedCategory._id.toString(),
            name: updatedCategory.name,
            description: updatedCategory.description,
            image: updatedCategory.image,
            jobs: updatedCategory.jobs,
            isActive: updatedCategory.isActive,
        });
        return {
            success: true,
            message: "Category updated successfully",
            data: updatedCategory,
        };
    }
    static async deleteCategory(categoryId) {
        const category = await category_repository_1.CategoryRepository.findById(categoryId);
        if (!category) {
            throw new errorHandler_1.AppError("Category not found", 404);
        }
        if (!category.isActive) {
            throw new errorHandler_1.AppError("Category is already inactive", 400);
        }
        const updatedCategory = await category_repository_1.CategoryRepository.updateById(categoryId, {
            isActive: false,
        });
        await (0, rabbitmq_1.publishToQueue)(category_constants_1.CATEGORY_QUEUE_EVENTS.DEACTIVATED, {
            categoryId: updatedCategory._id.toString(),
            name: updatedCategory.name,
            isActive: updatedCategory.isActive,
        });
        return {
            success: true,
            message: "Category deactivated successfully",
        };
    }
}
exports.CategoryService = CategoryService;
