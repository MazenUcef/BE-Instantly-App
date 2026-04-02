"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AvailabilityService = void 0;
const User_model_1 = __importDefault(require("../../auth/models/User.model"));
const offer_model_1 = __importDefault(require("../../offer/models/offer.model"));
const order_model_1 = __importDefault(require("../../order/models/order.model"));
const bundleBooking_model_1 = __importDefault(require("../../bundleBooking/models/bundleBooking.model"));
const errorHandler_1 = require("../../../shared/middlewares/errorHandler");
const availability_repository_1 = require("../repositories/availability.repository");
const calendar_1 = require("../../../shared/utils/calendar");
const availability_constants_1 = require("../../../shared/constants/availability.constants");
const getDateOnly = (date) => {
    const d = new Date(date);
    return d.toISOString().split("T")[0];
};
const minutesToTime = (totalMinutes) => {
    const h = String(Math.floor(totalMinutes / 60)).padStart(2, "0");
    const m = String(totalMinutes % 60).padStart(2, "0");
    return `${h}:${m}`;
};
class AvailabilityService {
    static async ensureSupplier(userId) {
        const supplier = await User_model_1.default.findById(userId);
        if (!supplier || supplier.role !== "supplier") {
            throw new errorHandler_1.AppError("Only suppliers can access this availability action", 403);
        }
        return supplier;
    }
    static validateWeeklySchedule(weeklySchedule) {
        const days = weeklySchedule.map((item) => item.dayOfWeek).sort((a, b) => a - b);
        if (days.length !== 7 || days.some((day, index) => day !== index)) {
            throw new errorHandler_1.AppError("weeklySchedule must contain 7 unique days from 0 to 6", 400);
        }
        for (const item of weeklySchedule) {
            if (item.isWorking) {
                if (!item.startTime || !item.endTime) {
                    throw new errorHandler_1.AppError(`Working day ${item.dayOfWeek} must include startTime and endTime`, 400);
                }
                if (item.startTime >= item.endTime) {
                    throw new errorHandler_1.AppError(`startTime must be before endTime for day ${item.dayOfWeek}`, 400);
                }
                if (item.breakStart && item.breakEnd && item.breakStart >= item.breakEnd) {
                    throw new errorHandler_1.AppError(`breakStart must be before breakEnd for day ${item.dayOfWeek}`, 400);
                }
            }
        }
    }
    static async getMyAvailability(input) {
        await this.ensureSupplier(input.supplierId);
        let availability = await availability_repository_1.AvailabilityRepository.findBySupplierId(input.supplierId);
        if (!availability) {
            availability = await availability_repository_1.AvailabilityRepository.createDefaultForSupplier(input.supplierId);
        }
        return {
            success: true,
            availability,
        };
    }
    static async upsertMyAvailability(input) {
        const { supplierId, timezone, weeklySchedule } = input;
        await this.ensureSupplier(supplierId);
        this.validateWeeklySchedule(weeklySchedule);
        const availability = await availability_repository_1.AvailabilityRepository.upsertAvailability(supplierId, {
            timezone: timezone || availability_constants_1.DEFAULT_AVAILABILITY_TIMEZONE,
            weeklySchedule,
        });
        return {
            success: true,
            message: "Availability updated successfully",
            availability,
        };
    }
    static async blockDate(input) {
        const { supplierId, date, reason, isFullDay = true, startTime, endTime } = input;
        await this.ensureSupplier(supplierId);
        if (!isFullDay) {
            if (!startTime || !endTime) {
                throw new errorHandler_1.AppError("startTime and endTime are required for partial blocked dates", 400);
            }
            if (startTime >= endTime) {
                throw new errorHandler_1.AppError("startTime must be before endTime", 400);
            }
        }
        const availability = await availability_repository_1.AvailabilityRepository.addBlockedDate(supplierId, {
            date,
            reason: reason || null,
            isFullDay,
            startTime: isFullDay ? null : startTime || null,
            endTime: isFullDay ? null : endTime || null,
        });
        return {
            success: true,
            message: "Date blocked successfully",
            availability,
        };
    }
    static async removeBlockedDate(input) {
        const { supplierId, blockedDateId } = input;
        await this.ensureSupplier(supplierId);
        const availability = await availability_repository_1.AvailabilityRepository.removeBlockedDate(supplierId, blockedDateId);
        if (!availability) {
            throw new errorHandler_1.AppError("Availability not found", 404);
        }
        return {
            success: true,
            message: "Blocked date removed successfully",
            availability,
        };
    }
    static async getSupplierAvailableSlots(input) {
        const { supplierId, date } = input;
        const supplier = await User_model_1.default.findById(supplierId);
        if (!supplier || supplier.role !== "supplier") {
            throw new errorHandler_1.AppError("Supplier not found", 404);
        }
        const availability = await availability_repository_1.AvailabilityRepository.findBySupplierId(supplierId);
        if (!availability) {
            return {
                success: true,
                date,
                slots: [],
            };
        }
        const targetDate = new Date(date);
        const dayOfWeek = targetDate.getDay();
        const schedule = availability.weeklySchedule.find((item) => item.dayOfWeek === dayOfWeek);
        if (!schedule || !schedule.isWorking || !schedule.startTime || !schedule.endTime) {
            return {
                success: true,
                date,
                slots: [],
            };
        }
        let slots = (0, calendar_1.generateSlots)(schedule.startTime, schedule.endTime, schedule.slotDurationMinutes, schedule.breakStart || undefined, schedule.breakEnd || undefined);
        const blockedDates = availability.blockedDates.filter((item) => getDateOnly(item.date) === date);
        if (blockedDates.some((item) => item.isFullDay)) {
            return {
                success: true,
                date,
                slots: [],
            };
        }
        slots = slots.filter((slot) => {
            for (const blocked of blockedDates) {
                if (blocked.startTime && blocked.endTime) {
                    if ((0, calendar_1.overlapsTimeRange)(slot.start, slot.end, blocked.startTime, blocked.endTime)) {
                        return false;
                    }
                }
            }
            return true;
        });
        const acceptedBookings = await bundleBooking_model_1.default.find({
            supplierId,
            bookedDate: date,
            status: { $in: [...availability_constants_1.ACTIVE_BOOKING_STATUSES] },
        }).lean();
        slots = slots.filter((slot) => {
            for (const booking of acceptedBookings) {
                if ((0, calendar_1.overlapsTimeRange)(slot.start, slot.end, booking.slotStart, booking.slotEnd)) {
                    return false;
                }
            }
            return true;
        });
        const acceptedOffers = await offer_model_1.default.find({
            supplierId,
            status: { $in: [...availability_constants_1.ACTIVE_OFFER_STATUSES_FOR_CALENDAR] },
            timeToStart: { $exists: true, $ne: null },
        }).lean();
        const acceptedJobsForDate = acceptedOffers.filter((offer) => {
            if (!offer.timeToStart)
                return false;
            return getDateOnly(offer.timeToStart) === date;
        });
        const orderIds = acceptedJobsForDate.map((offer) => offer.orderId);
        const orders = await order_model_1.default.find({ _id: { $in: orderIds } }).lean();
        slots = slots.filter((slot) => {
            for (const offer of acceptedJobsForDate) {
                const order = orders.find((o) => String(o._id) === String(offer.orderId));
                void order;
                const start = offer.timeToStart ? new Date(offer.timeToStart) : null;
                if (!start)
                    continue;
                const startMinutes = start.getHours() * 60 + start.getMinutes();
                const endMinutes = startMinutes + availability_constants_1.DEFAULT_ACCEPTED_JOB_DURATION_MINUTES;
                const jobStart = minutesToTime(startMinutes);
                const jobEnd = minutesToTime(endMinutes);
                if ((0, calendar_1.overlapsTimeRange)(slot.start, slot.end, jobStart, jobEnd)) {
                    return false;
                }
            }
            return true;
        });
        return {
            success: true,
            date,
            slots,
        };
    }
}
exports.AvailabilityService = AvailabilityService;
