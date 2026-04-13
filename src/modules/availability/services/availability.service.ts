import UserModel from "../../auth/models/User.model";
import bundleBookingModel from "../../bundleBooking/models/bundleBooking.model";
import orderModel from "../../order/models/Order.model";
import offerModel from "../../offer/models/Offer.model";
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
          scheduledAt: { $lte: monthEnd },
        })
        .populate("customerId", "firstName lastName email phoneNumber profilePicture address")
        .populate("categoryId", "name nameAr")
        .populate("governmentId", "name nameAr")
        .lean(),
    ]);

    const orderIds = scheduledOrders.map((o) => o._id);
    const acceptedOffers = orderIds.length
      ? await offerModel
          .find({ orderId: { $in: orderIds }, status: "accepted" })
          .lean()
      : [];
    const offerByOrderId = new Map<string, any>();
    for (const off of acceptedOffers) {
      offerByOrderId.set(String(off.orderId), off);
    }

    const busyDates = new Set<string>();
    const ordersByDate: Record<string, any[]> = {};

    for (const booking of bookings) {
      busyDates.add(String(booking.bookedDate));
    }

    for (const order of scheduledOrders) {
      if (!order.scheduledAt) continue;
      const days = Math.max(1, order.expectedDays || 1);
      const start = new Date(order.scheduledAt);
      const orderWithOffer = {
        ...order,
        offer: offerByOrderId.get(String(order._id)) || null,
      };
      for (let i = 0; i < days; i++) {
        const d = new Date(start);
        d.setUTCDate(d.getUTCDate() + i);
        if (d < monthStart || d > monthEnd) continue;
        const dateStr = getDateOnly(d);
        busyDates.add(dateStr);
        if (!ordersByDate[dateStr]) ordersByDate[dateStr] = [];
        ordersByDate[dateStr].push(orderWithOffer);
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
      ordersByDate,
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
          scheduledAt: { $lte: dayEnd },
        })
        .populate("customerId", "firstName lastName email phoneNumber profilePicture address")
        .populate("categoryId", "name nameAr")
        .populate("governmentId", "name nameAr")
        .lean(),
    ]);

    const orderIds = scheduledOrders.map((o) => o._id);
    const acceptedOffers = orderIds.length
      ? await offerModel
          .find({ orderId: { $in: orderIds }, status: "accepted" })
          .lean()
      : [];
    const offerByOrderId = new Map<string, any>();
    for (const off of acceptedOffers) {
      offerByOrderId.set(String(off.orderId), off);
    }

    const bookedTimes: {
      start: string;
      end: string;
      type: "booking" | "order";
      order?: any;
      booking?: any;
    }[] = [];

    for (const booking of bookings) {
      bookedTimes.push({
        start: booking.slotStart,
        end: booking.slotEnd,
        type: "booking",
        booking,
      });
    }

    for (const order of scheduledOrders) {
      if (!order.scheduledAt) continue;
      const startDate = new Date(order.scheduledAt);
      const days = Math.max(1, order.expectedDays || 1);
      const endDate = new Date(startDate);
      endDate.setUTCDate(endDate.getUTCDate() + days);
      if (endDate <= dayStart || startDate > dayEnd) continue;

      const startMinutes =
        startDate.getUTCHours() * 60 + startDate.getUTCMinutes();
      const duration =
        order.estimatedDuration || DEFAULT_ACCEPTED_JOB_DURATION_MINUTES;
      const endMinutes = Math.min(startMinutes + duration, 24 * 60);

      bookedTimes.push({
        start: minutesToTime(startMinutes),
        end: minutesToTime(endMinutes),
        type: "order",
        order: {
          ...order,
          offer: offerByOrderId.get(String(order._id)) || null,
        },
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
