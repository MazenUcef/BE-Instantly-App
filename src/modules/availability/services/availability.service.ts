import prisma from "../../../shared/config/prisma";
import {
  BundleBookingStatus,
  OfferStatus,
  OrderStatus,
  UserRole,
} from "@prisma/client";
import { AppError } from "../../../shared/middlewares/errorHandler";
import { ACTIVE_BOOKING_STATUSES } from "../../../shared/constants/availability.constants";

type DayStatus = "available" | "has_bookings";

const ACTIVE_BOOKING_ENUM = ACTIVE_BOOKING_STATUSES.map(
  (s) => s as BundleBookingStatus,
);

const getDateOnly = (date: Date | string) => {
  const d = new Date(date);
  return d.toISOString().split("T")[0];
};

const minutesToTime = (totalMinutes: number) => {
  const h = String(Math.floor(totalMinutes / 60)).padStart(2, "0");
  const m = String(totalMinutes % 60).padStart(2, "0");
  return `${h}:${m}`;
};

const customerSelect = {
  id: true,
  firstName: true,
  lastName: true,
  email: true,
  phoneNumber: true,
  profilePicture: true,
  address: true,
} as const;
const taxonomySelect = { id: true, name: true, nameAr: true } as const;

export class AvailabilityService {
  static async getSupplierCalendar(input: { supplierId: string; month: string }) {
    const { supplierId, month } = input;

    const supplier = await prisma.user.findUnique({ where: { id: supplierId } });
    if (!supplier || supplier.role !== UserRole.supplier) {
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
      prisma.bundleBooking.findMany({
        where: {
          supplierId,
          bookedDate: {
            gte: month + "-01",
            lte: month + "-" + String(daysInMonth).padStart(2, "0"),
          },
          status: { in: ACTIVE_BOOKING_ENUM },
        },
      }),
      prisma.order.findMany({
        where: {
          supplierId,
          status: { in: [OrderStatus.scheduled, OrderStatus.in_progress] },
          scheduledAt: { lte: monthEnd },
        },
        include: {
          customer: { select: customerSelect },
          category: { select: { id: true, name: true } },
          government: { select: taxonomySelect },
        },
      }),
    ]);

    const orderIds = scheduledOrders.map((o) => o.id);
    const acceptedOffers = orderIds.length
      ? await prisma.offer.findMany({
          where: { orderId: { in: orderIds }, status: OfferStatus.accepted },
        })
      : [];
    const offerByOrderId = new Map<string, any>();
    for (const off of acceptedOffers) offerByOrderId.set(off.orderId, off);

    const busyDates = new Set<string>();
    const ordersByDate: Record<string, any[]> = {};

    for (const booking of bookings) busyDates.add(booking.bookedDate);

    for (const order of scheduledOrders) {
      if (!order.scheduledAt) continue;
      const days = Math.max(1, order.expectedDays || 1);
      const start = new Date(order.scheduledAt);
      const orderWithOffer = {
        ...order,
        offer: offerByOrderId.get(order.id) || null,
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

    return { success: true, month, days, ordersByDate };
  }

  static async getSupplierBookedTimes(input: { supplierId: string; date: string }) {
    const { supplierId, date } = input;

    const supplier = await prisma.user.findUnique({ where: { id: supplierId } });
    if (!supplier || supplier.role !== UserRole.supplier) {
      throw new AppError("Supplier not found", 404);
    }

    const dayEnd = new Date(date + "T23:59:59.999Z");

    const [bookings, scheduledOrders] = await Promise.all([
      prisma.bundleBooking.findMany({
        where: {
          supplierId,
          bookedDate: date,
          status: { in: ACTIVE_BOOKING_ENUM },
        },
      }),
      prisma.order.findMany({
        where: {
          supplierId,
          status: { in: [OrderStatus.scheduled, OrderStatus.in_progress] },
          scheduledAt: { lte: dayEnd },
        },
        include: {
          customer: { select: customerSelect },
          category: { select: { id: true, name: true } },
          government: { select: taxonomySelect },
        },
      }),
    ]);

    const orderIds = scheduledOrders.map((o) => o.id);
    const acceptedOffers = orderIds.length
      ? await prisma.offer.findMany({
          where: { orderId: { in: orderIds }, status: OfferStatus.accepted },
        })
      : [];
    const offerByOrderId = new Map<string, any>();
    for (const off of acceptedOffers) offerByOrderId.set(off.orderId, off);

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

    const DEFAULT_DAY_START_MINUTES = 9 * 60;
    const DEFAULT_DAY_END_MINUTES = 17 * 60;

    for (const order of scheduledOrders) {
      if (!order.scheduledAt) continue;
      const startDate = new Date(order.scheduledAt);
      const days = Math.max(1, order.expectedDays || 1);

      const firstDayStr = getDateOnly(startDate);
      const lastDay = new Date(startDate);
      lastDay.setUTCDate(lastDay.getUTCDate() + days - 1);
      const lastDayStr = getDateOnly(lastDay);

      if (date < firstDayStr || date > lastDayStr) continue;

      const isFirstDay = date === firstDayStr;
      const startMinutes = isFirstDay
        ? startDate.getUTCHours() * 60 + startDate.getUTCMinutes()
        : DEFAULT_DAY_START_MINUTES;
      const endMinutes = DEFAULT_DAY_END_MINUTES;

      bookedTimes.push({
        start: minutesToTime(startMinutes),
        end: minutesToTime(endMinutes),
        type: "order",
        order: {
          ...order,
          offer: offerByOrderId.get(order.id) || null,
        },
      });
    }

    bookedTimes.sort((a, b) => a.start.localeCompare(b.start));

    return { success: true, date, bookedTimes };
  }
}
