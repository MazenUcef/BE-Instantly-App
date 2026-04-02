"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.BundleBookingRepository = void 0;
const bundleBooking_model_1 = __importDefault(require("../models/bundleBooking.model"));
class BundleBookingRepository {
    static createBooking(data, session) {
        return bundleBooking_model_1.default.create([data], { session }).then((docs) => docs[0]);
    }
    static findById(bookingId, session) {
        return bundleBooking_model_1.default.findById(bookingId).session(session || null);
    }
    static findSupplierBookingByStatus(bookingId, supplierId, status, session) {
        return bundleBooking_model_1.default.findOne({
            _id: bookingId,
            supplierId,
            status,
        }).session(session || null);
    }
    static findCustomerBookings(customerId, status) {
        const filter = { customerId };
        if (status)
            filter.status = status;
        return bundleBooking_model_1.default.find(filter).sort({
            scheduledAt: 1,
            createdAt: -1,
        });
    }
    static findSupplierBookings(supplierId, status) {
        const filter = { supplierId };
        if (status)
            filter.status = status;
        return bundleBooking_model_1.default.find(filter).sort({
            scheduledAt: 1,
            createdAt: -1,
        });
    }
    static findOverlappingSupplierBookings(input) {
        return bundleBooking_model_1.default.find({
            supplierId: input.supplierId,
            bookedDate: input.bookedDate,
            status: { $in: [...input.statuses] },
        });
    }
    static updateBooking(bookingId, update, session) {
        return bundleBooking_model_1.default.findByIdAndUpdate(bookingId, { $set: update }, { new: true, session });
    }
}
exports.BundleBookingRepository = BundleBookingRepository;
