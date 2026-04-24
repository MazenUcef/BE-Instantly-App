import prisma from "../../../shared/config/prisma";
import {
  BundleBookingStatus,
  OfferStatus,
  OrderStatus,
  OrderType,
  UserRole,
} from "@prisma/client";
import { AppError } from "../../../shared/middlewares/errorHandler";
import {
  ACTIVE_BOOKING_STATUSES,
  DEFAULT_AVAILABILITY_TIMEZONE,
} from "../../../shared/constants/availability.constants";

type DayStatus = "available" | "has_bookings";

const ACTIVE_BOOKING_ENUM = ACTIVE_BOOKING_STATUSES.map(
  (s) => s as BundleBookingStatus,
);

const WORK_DAY_START_MINUTES = 9 * 60;
const WORK_DAY_END_MINUTES = 17 * 60;

const pad2 = (n: number) => String(n).padStart(2, "0");

const minutesToTime = (totalMinutes: number) => {
  const h = pad2(Math.floor(totalMinutes / 60));
  const m = pad2(totalMinutes % 60);
  return `${h}:${m}`;
};

type LocalParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
};

const getLocalParts = (date: Date, timeZone: string): LocalParts => {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const get = (type: string) =>
    Number(parts.find((p) => p.type === type)?.value ?? "0");
  let hour = get("hour");
  if (hour === 24) hour = 0;
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour,
    minute: get("minute"),
  };
};

const addCalendarDays = (
  year: number,
  month: number,
  day: number,
  days: number,
) => {
  const d = new Date(Date.UTC(year, month - 1, day + days));
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1,
    day: d.getUTCDate(),
  };
};

const toDateStr = (year: number, month: number, day: number) =>
  `${year}-${pad2(month)}-${pad2(day)}`;

type DateBlock = { dateStr: string; startMin: number; endMin: number };

type OrderForBlocks = {
  scheduledAt: Date | null;
  orderType: OrderType;
  expectedDays: number | null;
  estimatedDuration: number | null;
};

const getOrderDateBlocks = (
  order: OrderForBlocks,
  timezone: string,
): DateBlock[] => {
  if (!order.scheduledAt) return [];
  const start = new Date(order.scheduledAt);

  if (order.orderType === OrderType.daily) {
    const local = getLocalParts(start, timezone);
    const startMinutes = local.hour * 60 + local.minute;

    let baseY = local.year;
    let baseM = local.month;
    let baseD = local.day;
    let firstDayStart = Math.max(WORK_DAY_START_MINUTES, startMinutes);

    if (startMinutes >= WORK_DAY_END_MINUTES) {
      const shifted = addCalendarDays(baseY, baseM, baseD, 1);
      baseY = shifted.year;
      baseM = shifted.month;
      baseD = shifted.day;
      firstDayStart = WORK_DAY_START_MINUTES;
    }

    const days = Math.max(1, order.expectedDays || 1);
    const blocks: DateBlock[] = [];
    for (let i = 0; i < days; i++) {
      const d = addCalendarDays(baseY, baseM, baseD, i);
      blocks.push({
        dateStr: toDateStr(d.year, d.month, d.day),
        startMin: i === 0 ? firstDayStart : WORK_DAY_START_MINUTES,
        endMin: WORK_DAY_END_MINUTES,
      });
    }
    return blocks;
  }

  const durationMin = Math.max(1, order.estimatedDuration || 60);
  const endUtc = new Date(start.getTime() + durationMin * 60000);
  const localStart = getLocalParts(start, timezone);
  const localEnd = getLocalParts(endUtc, timezone);

  const blocks: DateBlock[] = [];
  let curY = localStart.year;
  let curM = localStart.month;
  let curD = localStart.day;

  for (let i = 0; i < 366; i++) {
    const isFirst =
      curY === localStart.year &&
      curM === localStart.month &&
      curD === localStart.day;
    const isLast =
      curY === localEnd.year &&
      curM === localEnd.month &&
      curD === localEnd.day;
    blocks.push({
      dateStr: toDateStr(curY, curM, curD),
      startMin: isFirst ? localStart.hour * 60 + localStart.minute : 0,
      endMin: isLast ? localEnd.hour * 60 + localEnd.minute : 24 * 60,
    });
    if (isLast) break;
    const next = addCalendarDays(curY, curM, curD, 1);
    curY = next.year;
    curM = next.month;
    curD = next.day;
  }
  return blocks;
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

    const supplier = await prisma.user.findUnique({
      where: { id: supplierId },
      include: { availability: { select: { timezone: true } } },
    });
    if (!supplier || supplier.role !== UserRole.supplier) {
      throw new AppError("Supplier not found", 404);
    }
    const timezone =
      supplier.availability?.timezone || DEFAULT_AVAILABILITY_TIMEZONE;

    const [yearStr, monthStr] = month.split("-");
    const year = parseInt(yearStr, 10);
    const monthIndex = parseInt(monthStr, 10) - 1;
    const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();

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

    const monthPrefix = month + "-";
    const busyDates = new Set<string>();
    const ordersByDate: Record<string, any[]> = {};

    for (const booking of bookings) busyDates.add(booking.bookedDate);

    for (const order of scheduledOrders) {
      const blocks = getOrderDateBlocks(order, timezone);
      const orderWithOffer = {
        ...order,
        offer: offerByOrderId.get(order.id) || null,
      };
      for (const b of blocks) {
        if (!b.dateStr.startsWith(monthPrefix)) continue;
        busyDates.add(b.dateStr);
        if (!ordersByDate[b.dateStr]) ordersByDate[b.dateStr] = [];
        ordersByDate[b.dateStr].push(orderWithOffer);
      }
    }

    const days: Record<string, DayStatus> = {};
    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${month}-${pad2(day)}`;
      days[dateStr] = busyDates.has(dateStr) ? "has_bookings" : "available";
    }

    return { success: true, month, days, ordersByDate };
  }

  static async getSupplierBookedTimes(input: { supplierId: string; date: string }) {
    const { supplierId, date } = input;

    const supplier = await prisma.user.findUnique({
      where: { id: supplierId },
      include: { availability: { select: { timezone: true } } },
    });
    if (!supplier || supplier.role !== UserRole.supplier) {
      throw new AppError("Supplier not found", 404);
    }
    const timezone =
      supplier.availability?.timezone || DEFAULT_AVAILABILITY_TIMEZONE;

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

    for (const order of scheduledOrders) {
      const blocks = getOrderDateBlocks(order, timezone);
      const match = blocks.find((b) => b.dateStr === date);
      if (!match) continue;
      bookedTimes.push({
        start: minutesToTime(match.startMin),
        end: minutesToTime(Math.min(match.endMin, 24 * 60 - 1)),
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
