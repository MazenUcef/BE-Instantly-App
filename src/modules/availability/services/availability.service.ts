import UserModel from "../../auth/models/User.model";

import bundleBookingModel from "../../bundleBooking/models/bundleBooking.model";
import { AppError } from "../../../shared/middlewares/errorHandler";
import { AvailabilityRepository } from "../repositories/availability.repository";

import { generateSlots, overlapsTimeRange } from "../../../shared/utils/calendar";
import { ACTIVE_BOOKING_STATUSES, ACTIVE_OFFER_STATUSES_FOR_CALENDAR, DEFAULT_ACCEPTED_JOB_DURATION_MINUTES, DEFAULT_AVAILABILITY_TIMEZONE } from "../../../shared/constants/availability.constants";
import orderModel from "../../order/models/order.model";
import offerModel from "../../offer/models/offer.model";

const getDateOnly = (date: Date | string) => {
  const d = new Date(date);
  return d.toISOString().split("T")[0];
};

const minutesToTime = (totalMinutes: number) => {
  const h = String(Math.floor(totalMinutes / 60)).padStart(2, "0");
  const m = String(totalMinutes % 60).padStart(2, "0");
  return `${h}:${m}`;
};

export class AvailabilityService {
  private static async ensureSupplier(userId: string) {
    const supplier = await UserModel.findById(userId);

    if (!supplier || supplier.role !== "supplier") {
      throw new AppError("Only suppliers can access this availability action", 403);
    }

    return supplier;
  }

  private static validateWeeklySchedule(weeklySchedule: any[]) {
    const days = weeklySchedule.map((item) => item.dayOfWeek).sort((a, b) => a - b);

    if (days.length !== 7 || days.some((day, index) => day !== index)) {
      throw new AppError("weeklySchedule must contain 7 unique days from 0 to 6", 400);
    }

    for (const item of weeklySchedule) {
      if (item.isWorking) {
        if (!item.startTime || !item.endTime) {
          throw new AppError(
            `Working day ${item.dayOfWeek} must include startTime and endTime`,
            400,
          );
        }

        if (item.startTime >= item.endTime) {
          throw new AppError(
            `startTime must be before endTime for day ${item.dayOfWeek}`,
            400,
          );
        }

        if (item.breakStart && item.breakEnd && item.breakStart >= item.breakEnd) {
          throw new AppError(
            `breakStart must be before breakEnd for day ${item.dayOfWeek}`,
            400,
          );
        }
      }
    }
  }

  static async getMyAvailability(input: {
    supplierId: string;
  }) {
    await this.ensureSupplier(input.supplierId);

    let availability = await AvailabilityRepository.findBySupplierId(input.supplierId);

    if (!availability) {
      availability = await AvailabilityRepository.createDefaultForSupplier(
        input.supplierId,
      );
    }

    return {
      success: true,
      availability,
    };
  }

  static async upsertMyAvailability(input: {
    supplierId: string;
    timezone?: string;
    weeklySchedule: any[];
  }) {
    const { supplierId, timezone, weeklySchedule } = input;

    await this.ensureSupplier(supplierId);

    this.validateWeeklySchedule(weeklySchedule);

    const availability = await AvailabilityRepository.upsertAvailability(
      supplierId,
      {
        timezone: timezone || DEFAULT_AVAILABILITY_TIMEZONE,
        weeklySchedule,
      },
    );

    return {
      success: true,
      message: "Availability updated successfully",
      availability,
    };
  }

  static async blockDate(input: {
    supplierId: string;
    date: string;
    reason?: string;
    isFullDay?: boolean;
    startTime?: string;
    endTime?: string;
  }) {
    const { supplierId, date, reason, isFullDay = true, startTime, endTime } = input;

    await this.ensureSupplier(supplierId);

    if (!isFullDay) {
      if (!startTime || !endTime) {
        throw new AppError("startTime and endTime are required for partial blocked dates", 400);
      }

      if (startTime >= endTime) {
        throw new AppError("startTime must be before endTime", 400);
      }
    }

    const availability = await AvailabilityRepository.addBlockedDate(
      supplierId,
      {
        date,
        reason: reason || null,
        isFullDay,
        startTime: isFullDay ? null : startTime || null,
        endTime: isFullDay ? null : endTime || null,
      },
    );

    return {
      success: true,
      message: "Date blocked successfully",
      availability,
    };
  }

  static async removeBlockedDate(input: {
    supplierId: string;
    blockedDateId: string;
  }) {
    const { supplierId, blockedDateId } = input;

    await this.ensureSupplier(supplierId);

    const availability = await AvailabilityRepository.removeBlockedDate(
      supplierId,
      blockedDateId,
    );

    if (!availability) {
      throw new AppError("Availability not found", 404);
    }

    return {
      success: true,
      message: "Blocked date removed successfully",
      availability,
    };
  }

  static async getSupplierAvailableSlots(input: {
    supplierId: string;
    date: string;
  }) {
    const { supplierId, date } = input;

    const supplier = await UserModel.findById(supplierId);

    if (!supplier || supplier.role !== "supplier") {
      throw new AppError("Supplier not found", 404);
    }

    const availability = await AvailabilityRepository.findBySupplierId(supplierId);

    if (!availability) {
      return {
        success: true,
        date,
        slots: [],
      };
    }

    const targetDate = new Date(date);
    const dayOfWeek = targetDate.getDay();

    const schedule = availability.weeklySchedule.find(
      (item) => item.dayOfWeek === dayOfWeek,
    );

    if (!schedule || !schedule.isWorking || !schedule.startTime || !schedule.endTime) {
      return {
        success: true,
        date,
        slots: [],
      };
    }

    let slots = generateSlots(
      schedule.startTime,
      schedule.endTime,
      schedule.slotDurationMinutes,
      schedule.breakStart || undefined,
      schedule.breakEnd || undefined,
    );

    const blockedDates = availability.blockedDates.filter(
      (item) => getDateOnly(item.date) === date,
    );

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
          if (
            overlapsTimeRange(
              slot.start,
              slot.end,
              blocked.startTime,
              blocked.endTime,
            )
          ) {
            return false;
          }
        }
      }
      return true;
    });

    const acceptedBookings = await bundleBookingModel.find({
      supplierId,
      bookedDate: date,
      status: { $in: [...ACTIVE_BOOKING_STATUSES] },
    }).lean();

    slots = slots.filter((slot) => {
      for (const booking of acceptedBookings) {
        if (
          overlapsTimeRange(slot.start, slot.end, booking.slotStart, booking.slotEnd)
        ) {
          return false;
        }
      }
      return true;
    });

    const acceptedOffers = await offerModel.find({
      supplierId,
      status: { $in: [...ACTIVE_OFFER_STATUSES_FOR_CALENDAR] },
      timeToStart: { $exists: true, $ne: null },
    }).lean();

    const acceptedJobsForDate = acceptedOffers.filter((offer) => {
      if (!offer.timeToStart) return false;
      return getDateOnly(offer.timeToStart) === date;
    });

    const orderIds = acceptedJobsForDate.map((offer) => offer.orderId);
    const orders = await orderModel.find({ _id: { $in: orderIds } }).lean();

    slots = slots.filter((slot) => {
      for (const offer of acceptedJobsForDate) {
        const order = orders.find((o: any) => String(o._id) === String(offer.orderId));
        void order;

        const start = offer.timeToStart ? new Date(offer.timeToStart) : null;
        if (!start) continue;

        const startMinutes = start.getHours() * 60 + start.getMinutes();
        const endMinutes =
          startMinutes + DEFAULT_ACCEPTED_JOB_DURATION_MINUTES;

        const jobStart = minutesToTime(startMinutes);
        const jobEnd = minutesToTime(endMinutes);

        if (overlapsTimeRange(slot.start, slot.end, jobStart, jobEnd)) {
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