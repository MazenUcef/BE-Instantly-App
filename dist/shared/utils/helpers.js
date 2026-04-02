"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildBundlePayload = exports.validateFile = void 0;
const User_model_1 = __importDefault(require("../../modules/auth/models/User.model"));
const bundle_model_1 = __importDefault(require("../../modules/bundle/models/bundle.model"));
const category_model_1 = __importDefault(require("../../modules/category/models/category.model"));
const government_model_1 = __importDefault(require("../../modules/government/models/government.model"));
const errorHandler_1 = require("../middlewares/errorHandler");
const validateFile = (file) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowedTypes.includes(file.mimetype)) {
        throw new errorHandler_1.AppError('Invalid file type', 400);
    }
    if (file.size > 5 * 1024 * 1024) {
        throw new errorHandler_1.AppError('File too large', 400);
    }
};
exports.validateFile = validateFile;
const buildBundlePayload = async (bundleId) => {
    const bundle = await bundle_model_1.default.findById(bundleId).lean();
    if (!bundle)
        return null;
    const [supplier, category, governments] = await Promise.all([
        User_model_1.default.findById(bundle.supplierId)
            .select("-password -refreshToken -biometrics")
            .lean(),
        category_model_1.default.findById(bundle.categoryId).lean(),
        government_model_1.default.find({
            _id: { $in: bundle.governmentIds || [] },
            isActive: true,
        }).lean(),
    ]);
    return {
        ...bundle,
        supplier,
        category,
        governments,
    };
};
exports.buildBundlePayload = buildBundlePayload;
