"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CategoryRepository = void 0;
const Category_model_1 = __importDefault(require("../models/Category.model"));
class CategoryRepository {
    static findActive(session) {
        return Category_model_1.default.find({ isActive: true })
            .sort({ createdAt: -1 })
            .session(session || null);
    }
    static findAll(session) {
        return Category_model_1.default.find()
            .sort({ createdAt: -1 })
            .session(session || null);
    }
    static findById(categoryId, session) {
        return Category_model_1.default.findById(categoryId).session(session || null);
    }
    static findByNormalizedName(normalizedName, session) {
        return Category_model_1.default.findOne({ normalizedName }).session(session || null);
    }
    static create(data, session) {
        return Category_model_1.default.create([data], { session }).then((docs) => docs[0]);
    }
    static updateById(categoryId, updates, session) {
        return Category_model_1.default.findByIdAndUpdate(categoryId, updates, {
            new: true,
            runValidators: true,
            session,
        });
    }
}
exports.CategoryRepository = CategoryRepository;
