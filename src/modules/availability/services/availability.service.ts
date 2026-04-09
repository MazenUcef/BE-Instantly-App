import UserModel from "../../auth/models/User.model";
import bundleBookingModel from "../../bundleBooking/models/bundleBooking.model";
import orderModel from "../../order/models/Order.model";
import { AppError } from "../../../shared/middlewares/errorHandler";
import {
  ACTIVE_BOOKING_STATUSES,
  DEFAULT_ACCEPTED_JOB_DURATION_MINUTES,
} from "../../../shared/constants/availability.constants";

type DayStatus = "available" | "has_bookings";

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
  static async getSupplierCalendar(input: {
    supplierId: string;
    month: string; // "YYYY-MM"
  }) {
    const { supplierId, month } = input;

    const supplier = await UserModel.findById(supplierId);
    if (!supplier || supplier.role !== "supplier") {
      throw new AppError("Supplier not found", 404);
    }

    const [yearStr, monthStr] = month.split("-");
    const year = parseInt(yearStr, 10);
    const monthIndex = parseInt(monthStr, 10) - 1;
    const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();

    const monthStart = new Date(Date.UTC(year, monthIndex, 1));
    const monthEnd = new Date(
      Date.UTC(year, monthIndex, daysInMonth, 23, 59, 59, 999),
    );

    const [bookings, scheduledOrders] = await Promise.all([
      bundleBookingModel
        .find({
          supplierId,
          bookedDate: {
            $gte: month + "-01",
            $lte: month + "-" + String(daysInMonth).padStart(2, "0"),
          },
          status: { $in: [...ACTIVE_BOOKING_STATUSES] },
        })
        .lean(),
      orderModel
        .find({
          supplierId,
          status: { $in: ["scheduled", "in_progress"] },
          scheduledAt: { $gte: monthStart, $lte: monthEnd },
        })
        .lean(),
    ]);

    const busyDates = new Set<string>();

    for (const booking of bookings) {
      busyDates.add(String(booking.bookedDate));
    }

    for (const order of scheduledOrders) {
      if (order.scheduledAt) {
        busyDates.add(getDateOnly(order.scheduledAt));
      }
    }

    const days: Record<string, DayStatus> = {};

    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${month}-${String(day).padStart(2, "0")}`;
      days[dateStr] = busyDates.has(dateStr) ? "has_bookings" : "available";
    }

    return {
      success: true,
      month,
      days,
    };
  }

  static async getSupplierBookedTimes(input: {
    supplierId: string;
    date: string;
  }) {
    const { supplierId, date } = input;

    const supplier = await UserModel.findById(supplierId);
    if (!supplier || supplier.role !== "supplier") {
      throw new AppError("Supplier not found", 404);
    }

    const dayStart = new Date(date + "T00:00:00.000Z");
    const dayEnd = new Date(date + "T23:59:59.999Z");

    const [bookings, scheduledOrders] = await Promise.all([
      bundleBookingModel
        .find({
          supplierId,
          bookedDate: date,
          status: { $in: [...ACTIVE_BOOKING_STATUSES] },
        })
        .lean(),
      orderModel
        .find({
          supplierId,
          status: { $in: ["scheduled", "in_progress"] },
          scheduledAt: { $gte: dayStart, $lte: dayEnd },
        })
        .lean(),
    ]);

    const bookedTimes: { start: string; end: string; type: "booking" | "order" }[] = [];

    for (const booking of bookings) {
      bookedTimes.push({
        start: booking.slotStart,
        end: booking.slotEnd,
        type: "booking",
      });
    }

    for (const order of scheduledOrders) {
      if (!order.scheduledAt) continue;
      const startDate = new Date(order.scheduledAt);
      const startMinutes = startDate.getHours() * 60 + startDate.getMinutes();
      const duration =
        order.estimatedDuration || DEFAULT_ACCEPTED_JOB_DURATION_MINUTES;
      const endMinutes = startMinutes + duration;

      bookedTimes.push({
        start: minutesToTime(startMinutes),
        end: minutesToTime(endMinutes),
        type: "order",
      });
    }

    bookedTimes.sort((a, b) => a.start.localeCompare(b.start));

    return {
      success: true,
      date,
      bookedTimes,
    };
  }
}
