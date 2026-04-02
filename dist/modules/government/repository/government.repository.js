"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.GovernmentRepository = void 0;
const government_model_1 = __importDefault(require("../models/government.model"));
class GovernmentRepository {
    static findActive(session) {
        return government_model_1.default.find({ isActive: true })
            .sort({ order: 1, name: 1 })
            .session(session || null);
    }
    static findAll(session) {
        return government_model_1.default.find()
            .sort({ order: 1, name: 1 })
            .session(session || null);
    }
    static findById(governmentId, session) {
        return government_model_1.default.findById(governmentId).session(session || null);
    }
    static findByNormalizedNames(normalizedName, normalizedNameAr, session) {
        return government_model_1.default.findOne({
            $or: [{ normalizedName }, { normalizedNameAr }],
        }).session(session || null);
    }
    static create(data, session) {
        return government_model_1.default.create([data], { session }).then((docs) => docs[0]);
    }
    static updateById(governmentId, updates, session) {
        return government_model_1.default.findByIdAndUpdate(governmentId, updates, {
            new: true,
            runValidators: true,
            session,
        });
    }
}
exports.GovernmentRepository = GovernmentRepository;
