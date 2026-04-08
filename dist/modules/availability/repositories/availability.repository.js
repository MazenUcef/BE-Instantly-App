"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AvailabilityRepository = void 0;
const availability_model_1 = __importDefault(require("../models/availability.model"));
class AvailabilityRepository {
    static findBySupplierId(supplierId, session) {
        return availability_model_1.default.findOne({ supplierId }).session(session || null);
    }
    static createDefaultForSupplier(supplierId, session) {
        return availability_model_1.default.create([{ supplierId }], { session }).then((docs) => docs[0]);
    }
    static findOrCreateBySupplierId(supplierId, session) {
        return availability_model_1.default.findOneAndUpdate({ supplierId }, { $setOnInsert: { supplierId } }, { new: true, upsert: true, session });
    }
    static upsertAvailability(supplierId, input, session) {
        return availability_model_1.default.findOneAndUpdate({ supplierId }, {
            $set: {
                timezone: input.timezone,
                weeklySchedule: input.weeklySchedule,
            },
        }, { new: true, upsert: true, session });
    }
    static addBlockedDate(supplierId, blockedDate, session) {
        return availability_model_1.default.findOneAndUpdate({ supplierId }, {
            $setOnInsert: { supplierId },
            $push: {
                blockedDates: blockedDate,
            },
        }, { new: true, upsert: true, session });
    }
    static removeBlockedDate(supplierId, blockedDateId, session) {
        return availability_model_1.default.findOneAndUpdate({ supplierId }, {
            $pull: {
                blockedDates: { _id: blockedDateId },
            },
        }, { new: true, session });
    }
}
exports.AvailabilityRepository = AvailabilityRepository;
