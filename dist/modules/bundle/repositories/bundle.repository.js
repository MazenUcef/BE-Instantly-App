"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.BundleRepository = void 0;
const bundle_model_1 = __importDefault(require("../models/bundle.model"));
class BundleRepository {
    static createBundle(data, session) {
        return bundle_model_1.default.create([data], { session }).then((docs) => docs[0]);
    }
    static findById(bundleId, session) {
        return bundle_model_1.default.findById(bundleId).session(session || null);
    }
    static findByIdForSupplier(bundleId, supplierId, session) {
        return bundle_model_1.default.findOne({ _id: bundleId, supplierId }).session(session || null);
    }
    static findAllActive(filter) {
        const query = { isActive: true };
        if (filter.categoryId)
            query.categoryId = filter.categoryId;
        if (filter.supplierId)
            query.supplierId = filter.supplierId;
        if (filter.governmentId)
            query.governmentIds = { $in: [filter.governmentId] };
        return bundle_model_1.default.find(query).sort({ createdAt: -1 });
    }
    static findBySupplierId(supplierId) {
        return bundle_model_1.default.find({ supplierId }).sort({ createdAt: -1 });
    }
    static updateBundle(bundleId, supplierId, update, session) {
        return bundle_model_1.default.findOneAndUpdate({ _id: bundleId, supplierId }, { $set: update }, { new: true, session });
    }
    static toggleBundleStatus(bundleId, supplierId, nextStatus, session) {
        return bundle_model_1.default.findOneAndUpdate({ _id: bundleId, supplierId }, { $set: { isActive: nextStatus } }, { new: true, session });
    }
    static deleteBundle(bundleId, supplierId, session) {
        return bundle_model_1.default.findOneAndDelete({ _id: bundleId, supplierId }, { session });
    }
}
exports.BundleRepository = BundleRepository;
