import prisma from "../../../shared/config/prisma";
import {
  Prisma,
  OrderStatus,
  OfferStatus,
  SessionStatus,
  BundleBookingStatus,
} from "@prisma/client";
import { AppError } from "../../../shared/middlewares/errorHandler";
import { OfferEventService } from "./offer-event.service";
import {
  ORDER_STATUS,
  ORDER_TYPE,
} from "../../../shared/constants/order.constants";
import { OFFER_STATUS, OFFER_NOTIFICATION_TYPES } from "../../../shared/constants/offer.constants";
import {
  getIO,
  socketEvents,
  socketRooms,
} from "../../../shared/config/socket";
import { buildSupplierOrderPayload } from "../../../shared/utils/buildSupplierOrderPayload";
import { OfferRepository } from "../repository/offer.repository";
import { OrderRepository } from "../../order/repositories/order.repository";
import { OrderEventService } from "../../order/services/order-event.service";
import { SessionRepository } from "../../session/repositories/session.repository";
import { SessionEventService } from "../../session/services/session-event.service";
import {
  SESSION_STATUS,
  SESSION_CANCELLED_BY,
  SESSION_NOTIFICATION_TYPES,
} from "../../../shared/constants/session.constants";
import { findTimeConflict, TimeWindow } from "../../../shared/utils/time-conflict";
import { publishNotification } from "../../notification/notification.publisher";
import { BUNDLE_BOOKING_ACTIVE_SLOT_STATUSES } from "../../../shared/constants/bundleBooking.constants";
import { parseTimeToMinutes } from "../../../shared/utils/calendar";

type Tx = Prisma.TransactionClient;

const DAILY_START_HOUR = 9;
const DAILY_DURATION_MINUTES = 8 * 60;

const BUNDLE_ACTIVE_ENUM = BUNDLE_BOOKING_ACTIVE_SLOT_STATUSES.map(
  (s) => s as BundleBookingStatus,
);

function normalizeDailyStart(input: Date | string): Date {
  const d = new Date(input);
  d.setUTCHours(DAILY_START_HOUR, 0, 0, 0);
  return d;
}

function resolveOfferSchedule(
  order: { orderType: string; timeToStart?: Date | string | null },
  input: {
    timeToStart?: Date | string | null;
    estimatedDuration?: number | null;
    expectedDays?: number | null;
  },
): { timeToStart: Date; estimatedDuration: number; expectedDays: number | null } {
  if (order.orderType === ORDER_TYPE.DAILY) {
    if (!input.timeToStart) {
      throw new AppError("timeToStart is required for daily orders", 400);
    }
    if (!input.expectedDays || input.expectedDays < 1) {
      throw new AppError(
        "expectedDays is required for daily orders and must be >= 1",
        400,
      );
    }
    return {
      timeToStart: normalizeDailyStart(input.timeToStart),
      estimatedDuration: DAILY_DURATION_MINUTES,
      expectedDays: input.expectedDays,
    };
  }

  if (!input.timeToStart) {
    throw new AppError("timeToStart is required for contract orders", 400);
  }
  if (!input.estimatedDuration || input.estimatedDuration < 1) {
    throw new AppError(
      "estimatedDuration is required for contract orders and must be >= 1 minute",
      400,
    );
  }

  return {
    timeToStart: new Date(input.timeToStart),
    estimatedDuration: input.estimatedDuration,
    expectedDays: null,
  };
}

async function resolveWorkflowSteps(order: any, tx: Tx): Promise<string[]> {
  const category = await tx.category.findUnique({
    where: { id: order.categoryId },
    include: { workflows: true },
  });
  if (!category) throw new AppError("Category not found", 404);
  const workflow = category.workflows.find((w) => w.key === order.selectedWorkflow);
  if (!workflow) throw new AppError("Workflow not found for this order's category", 400);
  return workflow.steps;
}

const userSelect = {
  id: true,
  firstName: true,
  lastName: true,
  email: true,
  phoneNumber: true,
  profilePicture: true,
  address: true,
  averageRating: true,
  totalReviews: true,
  role: true,
} as const;

export class OfferService {
  private static async ensureSupplierCanCreateOffer(supplierId: string, tx: Tx) {
    const [reviewRequiredOrder, activeSession] = await Promise.all([
      tx.order.findFirst({
        where: {
          supplierId,
          status: OrderStatus.completed,
          supplierReviewed: false,
        },
        orderBy: { updatedAt: "desc" },
      }),
      tx.jobSession.findFirst({
        where: {
          supplierId,
          status: { notIn: [SessionStatus.completed, SessionStatus.cancelled] },
        },
      }),
    ]);

    if (reviewRequiredOrder) {
      const session = await tx.jobSession.findFirst({
        where: { orderId: reviewRequiredOrder.id },
      });

      let customer = null;
      if (session?.customerId) {
        customer = await tx.user.findUnique({
          where: { id: session.customerId },
          select: userSelect,
        });
      }

      const error = new AppError(
        "You must review your last completed job before creating a new offer.",
        403,
      );
      (error as any).reviewRequired = true;
      (error as any).order = { ...reviewRequiredOrder, customer };
      throw error;
    }

    if (activeSession) {
      throw new AppError(
        "You have an active job session in progress. Complete it before taking new work.",
        400,
      );
    }
  }

  private static async checkSupplierTimeConflict(
    supplierId: string,
    timeToStart: Date,
    estimatedDuration: number,
    excludeOfferId: string | undefined,
    tx: Tx,
  ) {
    const dateStr = timeToStart.toISOString().split("T")[0];

    const [offerWindows, bundleBookings] = await Promise.all([
      OfferRepository.findSupplierScheduledWindows(supplierId, excludeOfferId, tx),
      tx.bundleBooking.findMany({
        where: {
          supplierId,
          bookedDate: dateStr,
          status: { in: BUNDLE_ACTIVE_ENUM },
        },
      }),
    ]);

    const mapped: TimeWindow[] = offerWindows
      .filter((w) => w.timeToStart && w.estimatedDuration)
      .map((w) => ({
        start: w.timeToStart!,
        durationMinutes: w.estimatedDuration!,
        referenceId: w.id,
      }));

    for (const b of bundleBookings) {
      const slotStartMin = parseTimeToMinutes(b.slotStart);
      const slotEndMin = parseTimeToMinutes(b.slotEnd);
      const bookingDate = new Date(b.scheduledAt);
      bookingDate.setHours(0, 0, 0, 0);
      const start = new Date(bookingDate.getTime() + slotStartMin * 60_000);
      mapped.push({
        start,
        durationMinutes: slotEndMin - slotStartMin,
        referenceId: b.id,
      });
    }

    return findTimeConflict(mapped, timeToStart, estimatedDuration);
  }

  private static async checkCustomerTimeConflict(
    customerId: string,
    timeToStart: Date,
    estimatedDuration: number,
    tx: Tx,
  ) {
    const dateStr = timeToStart.toISOString().split("T")[0];

    const [orderWindows, bundleBookings] = await Promise.all([
      OrderRepository.findCustomerScheduledWindows(customerId, tx),
      tx.bundleBooking.findMany({
        where: {
          customerId,
          bookedDate: dateStr,
          status: { in: BUNDLE_ACTIVE_ENUM },
        },
      }),
    ]);

    const mapped: TimeWindow[] = orderWindows
      .filter((w) => w.scheduledAt && w.estimatedDuration)
      .map((w) => ({
        start: w.scheduledAt!,
        durationMinutes: w.estimatedDuration!,
        referenceId: w.id,
      }));

    for (const b of bundleBookings) {
      const slotStartMin = parseTimeToMinutes(b.slotStart);
      const slotEndMin = parseTimeToMinutes(b.slotEnd);
      const bookingDate = new Date(b.scheduledAt);
      bookingDate.setHours(0, 0, 0, 0);
      const start = new Date(bookingDate.getTime() + slotStartMin * 60_000);
      mapped.push({
        start,
        durationMinutes: slotEndMin - slotStartMin,
        referenceId: b.id,
      });
    }

    return findTimeConflict(mapped, timeToStart, estimatedDuration);
  }

  static async createOffer(input: {
    supplierId: string;
    orderId: string;
    amount: number;
    estimatedDuration?: number | null;
    expectedDays?: number | null;
    timeToStart?: string | Date | null;
  }) {
    const { supplierId, orderId, amount } = input;

    if (!amount || amount <= 0) {
      throw new AppError("Offer amount must be greater than 0", 400);
    }

    const result = await prisma
      .$transaction(async (tx) => {
        await this.ensureSupplierCanCreateOffer(supplierId, tx);

        const order = await tx.order.findUnique({ where: { id: orderId } });
        if (!order) throw new AppError("Order not found", 404);
        if (order.status !== OrderStatus.pending) {
          throw new AppError("Cannot create offer for this order now", 400);
        }
        if (order.customerId === supplierId) {
          throw new AppError("You cannot create an offer on your own order", 400);
        }

        const schedule = resolveOfferSchedule(order, {
          timeToStart: input.timeToStart,
          estimatedDuration: input.estimatedDuration,
          expectedDays: input.expectedDays,
        });

        if (schedule.timeToStart > new Date()) {
          const conflict = await this.checkSupplierTimeConflict(
            supplierId,
            schedule.timeToStart,
            schedule.estimatedDuration,
            undefined,
            tx,
          );
          if (conflict) {
            throw new AppError(
              `Time conflict: you already have a booking starting at ${conflict.start.toISOString()} for ${conflict.durationMinutes} minutes`,
              409,
            );
          }
        }

        const existingOffer = await OfferRepository.findPendingOfferBySupplierAndOrder(
          supplierId,
          orderId,
          tx,
        );

        let offer: any;
        let created: boolean;

        if (existingOffer) {
          offer = await OfferRepository.updatePendingOffer(
            existingOffer.id,
            {
              amount,
              estimatedDuration: schedule.estimatedDuration,
              expectedDays: schedule.expectedDays,
              timeToStart: schedule.timeToStart,
              expiresAt: null,
            },
            tx,
          );
          created = false;
        } else {
          offer = await OfferRepository.createOffer(
            {
              orderId,
              supplierId,
              amount,
              estimatedDuration: schedule.estimatedDuration,
              expectedDays: schedule.expectedDays,
              timeToStart: schedule.timeToStart,
              expiresAt: null,
              status: OfferStatus.pending,
            },
            tx,
          );
          created = true;
        }

        return { offer, order, created };
      })
      .catch((error: any) => {
        if (error?.code === "P2002") {
          throw new AppError(
            "A pending offer for this order already exists for this supplier.",
            409,
          );
        }
        throw error;
      });

    const { offer, order, created } = result;

    const payload = created
      ? await OfferEventService.emitOfferCreatedToCustomer({
          customerId: order.customerId,
          offer,
        })
      : await OfferEventService.emitOfferUpdatedToCustomer({
          customerId: order.customerId,
          offer,
        });

    const io = getIO();
    io.to(socketRooms.user(supplierId)).emit(
      created
        ? socketEvents.SUPPLIER_OFFER_CREATED
        : socketEvents.SUPPLIER_OFFER_UPDATED,
      { offer: payload, timestamp: new Date() },
    );

    const notifyCustomer = created
      ? OfferEventService.notifyCustomerNewOffer({
          customerId: order.customerId,
          orderId: order.id,
          offerId: offer.id,
          supplierId,
          amount,
          estimatedDuration: offer.estimatedDuration ?? null,
          timeToStart: offer.timeToStart ?? null,
        })
      : OfferEventService.notifyCustomerOfferUpdated({
          customerId: order.customerId,
          orderId: order.id,
          offerId: offer.id,
          supplierId,
          amount,
        });

    await Promise.all([
      OfferEventService.emitSupplierPendingCountUpdate(supplierId),
      OfferEventService.emitSupplierPendingOffersList(supplierId),
      notifyCustomer,
    ]);

    return {
      success: true,
      created,
      message: created
        ? "Offer created successfully"
        : "Offer updated successfully",
      offer: payload,
    };
  }

  static async acceptOffer(input: { offerId: string; customerId: string }) {
    const { offerId, customerId } = input;

    const result = await prisma
      .$transaction(async (tx) => {
        const existingOffer = await OfferRepository.findById(offerId, tx);
        if (!existingOffer) throw new AppError("Offer not found", 404);
        if (existingOffer.status !== OfferStatus.pending) {
          throw new AppError("Offer not found or already processed", 409);
        }

        const order = await tx.order.findUnique({
          where: { id: existingOffer.orderId },
        });
        if (!order) throw new AppError("Associated order not found", 404);
        if (order.customerId !== customerId) throw new AppError("Not allowed", 403);
        if (order.status !== OrderStatus.pending) {
          throw new AppError("Order is not available for offer acceptance", 409);
        }

        const offer = await OfferRepository.acceptPendingOffer(offerId, tx);
        if (!offer) throw new AppError("Offer not found or already processed", 409);

        const supplierOtherPendingOffers =
          await OfferRepository.findSupplierOtherPendingOffers(
            offer.supplierId,
            offer.id,
            tx,
          );

        const rejectedOrderOffers = await OfferRepository.findPendingOffersByOrder(
          order.id,
          tx,
        );

        await OfferRepository.rejectOtherPendingOffersForSupplier(
          offer.supplierId,
          offer.id,
          tx,
        );

        await OfferRepository.rejectOtherOffersForOrder(order.id, offer.id, tx);

        const offerStartTime: Date | null = offer.timeToStart
          ? new Date(offer.timeToStart)
          : null;
        const isScheduled = offerStartTime && offerStartTime > new Date();

        let sessionDoc: any = null;

        if (isScheduled && offerStartTime) {
          const duration = offer.estimatedDuration ?? 60;
          const [supplierConflict, customerConflict] = await Promise.all([
            this.checkSupplierTimeConflict(
              offer.supplierId,
              offerStartTime,
              duration,
              offer.id,
              tx,
            ),
            this.checkCustomerTimeConflict(
              order.customerId,
              offerStartTime,
              duration,
              tx,
            ),
          ]);

          if (supplierConflict) {
            throw new AppError(
              `Supplier has a conflicting booking at ${supplierConflict.start.toISOString()}`,
              409,
            );
          }
          if (customerConflict) {
            throw new AppError(
              `You have a conflicting booking at ${customerConflict.start.toISOString()}`,
              409,
            );
          }

          const updatedOrder = await OrderRepository.markScheduled(
            order.id,
            offer.supplierId,
            Number(offer.amount),
            offerStartTime,
            offer.estimatedDuration ?? null,
            tx,
          );
          if (!updatedOrder) throw new AppError("Order state changed concurrently", 409);
        } else {
          const updatedOrder = await OrderRepository.markInProgress(
            order.id,
            offer.supplierId,
            Number(offer.amount),
            tx,
          );
          if (!updatedOrder) throw new AppError("Order state changed concurrently", 409);

          const workflowSteps = await resolveWorkflowSteps(order, tx);

          sessionDoc = await SessionRepository.createSession(
            {
              orderId: order.id,
              offerId: offer.id,
              customerId: order.customerId,
              supplierId: offer.supplierId,
              workflowSteps,
              status: SESSION_STATUS.STARTED,
              startedAt: new Date(),
            },
            tx,
          );
        }

        return { offer, order, sessionDoc, supplierOtherPendingOffers, rejectedOrderOffers };
      })
      .catch((error: any) => {
        if (error?.code === "P2002") {
          throw new AppError(
            "This offer or supplier active job state changed. Please refresh and try again.",
            409,
          );
        }
        throw error;
      });

    const { offer, order, sessionDoc, supplierOtherPendingOffers } = result;

    const io = getIO();
    const isScheduled = !sessionDoc;

    const orderPayload = await buildSupplierOrderPayload(order.id);
    const sessionPayload = sessionDoc
      ? {
          _id: sessionDoc.id,
          orderId: sessionDoc.orderId,
          offerId: sessionDoc.offerId,
          customerId: sessionDoc.customerId,
          supplierId: sessionDoc.supplierId,
          status: sessionDoc.status,
        }
      : null;

    const offerMeta = {
      _id: offer.id,
      orderId: offer.orderId,
      supplierId: offer.supplierId,
      amount: offer.amount,
      status: offer.status,
      scheduledAt: offer.timeToStart || null,
      estimatedDuration: offer.estimatedDuration || null,
    };

    [offer.supplierId, order.customerId].forEach((uid) => {
      io.to(socketRooms.user(uid)).emit(socketEvents.OFFER_ACCEPTED, {
        offerId: offer.id,
        orderId: offer.orderId,
        supplierId: offer.supplierId,
        sessionId: sessionDoc?.id || null,
        isScheduled,
        scheduledAt: offer.timeToStart || null,
        order: orderPayload,
        session: sessionPayload,
        timestamp: new Date(),
      });
    });

    if (!isScheduled) {
      [order.customerId, offer.supplierId].forEach((uid) => {
        io.to(socketRooms.user(uid)).emit(socketEvents.SESSION_CREATED, {
          session: sessionPayload,
          order: orderPayload,
          offer: offerMeta,
          meta: { trigger: "offer_accepted", timestamp: new Date() },
        });
      });
    }

    for (const pendingOffer of supplierOtherPendingOffers) {
      const pendingOrder = await prisma.order.findUnique({
        where: { id: pendingOffer.orderId },
      });
      if (!pendingOrder) continue;

      io.to(socketRooms.user(pendingOrder.customerId)).emit(
        socketEvents.OFFER_DELETED,
        {
          offerId: pendingOffer.id,
          orderId: pendingOffer.orderId,
          supplierId: offer.supplierId,
          message: "Supplier withdrew their offer as they accepted another job",
          acceptedOrderId: order.id,
          timestamp: new Date(),
        },
      );
    }

    await Promise.all([
      OfferEventService.emitSupplierPendingCountUpdate(offer.supplierId),
      OfferEventService.emitSupplierPendingOffersList(offer.supplierId),
      OfferEventService.notifySupplierOfferAccepted({
        supplierId: offer.supplierId,
        orderId: order.id,
        offerId: offer.id,
        sessionId: sessionDoc?.id || null,
        withdrawnOrderIds: supplierOtherPendingOffers.map((o: any) => o.orderId),
      }),
      isScheduled
        ? Promise.all([
            publishNotification({
              userId: order.customerId,
              type: SESSION_NOTIFICATION_TYPES.SESSION_SCHEDULED,
              title: "Job Scheduled",
              message: `Your job has been scheduled for ${offer.timeToStart?.toISOString()}.`,
              data: { orderId: order.id, offerId: offer.id, scheduledAt: offer.timeToStart },
            }),
            publishNotification({
              userId: offer.supplierId,
              type: SESSION_NOTIFICATION_TYPES.SESSION_SCHEDULED,
              title: "Job Scheduled",
              message: `You have a scheduled job on ${offer.timeToStart?.toISOString()}.`,
              data: { orderId: order.id, offerId: offer.id, scheduledAt: offer.timeToStart },
            }),
          ])
        : SessionEventService.notifySessionCreated(sessionDoc),
    ]);

    return {
      success: true,
      message: isScheduled
        ? "Offer accepted and job scheduled"
        : "Offer accepted successfully",
      isScheduled,
      scheduledAt: isScheduled ? offer.timeToStart : null,
      offer: {
        _id: offer.id,
        orderId: offer.orderId,
        supplierId: offer.supplierId,
        amount: offer.amount,
        status: offer.status,
      },
      session: sessionPayload,
      order: orderPayload,
      withdrawnOffers: {
        count: supplierOtherPendingOffers.length,
        orders: supplierOtherPendingOffers.map((o: any) => o.orderId),
      },
    };
  }

  static async rejectOffer(input: { offerId: string; customerId: string }) {
    const { offerId, customerId } = input;

    const result = await prisma.$transaction(async (tx) => {
      const offer = await OfferRepository.findById(offerId, tx);
      if (!offer) throw new AppError("Offer not found", 404);

      const order = await tx.order.findUnique({ where: { id: offer.orderId } });
      if (!order) throw new AppError("Associated order not found", 404);
      if (order.customerId !== customerId) throw new AppError("Not allowed", 403);
      if (order.status !== OrderStatus.pending) {
        throw new AppError("Cannot reject offer for this order now", 400);
      }

      const rejectedOffer = await OfferRepository.rejectPendingOffer(offerId, tx);
      if (!rejectedOffer) throw new AppError("Offer not found or already processed", 409);

      return { rejectedOffer, order };
    });

    const { rejectedOffer } = result;
    const io = getIO();

    io.to(socketRooms.user(rejectedOffer.supplierId)).emit(
      socketEvents.OFFER_REJECTED,
      {
        offerId: rejectedOffer.id,
        orderId: rejectedOffer.orderId,
        reason: "customer_rejected",
        timestamp: new Date(),
      },
    );

    await Promise.all([
      OfferEventService.emitSupplierPendingCountUpdate(rejectedOffer.supplierId),
      OfferEventService.emitSupplierPendingOffersList(rejectedOffer.supplierId),
      OfferEventService.emitOrderAvailableAgain(rejectedOffer.orderId),
      OfferEventService.notifySupplierOfferRejected({
        supplierId: rejectedOffer.supplierId,
        offerId: rejectedOffer.id,
        orderId: rejectedOffer.orderId,
      }),
    ]);

    return {
      success: true,
      message: "Offer rejected successfully",
      offer: rejectedOffer,
    };
  }

  static async deleteOffer(input: { offerId: string; supplierId: string; reason: string }) {
    const { offerId, supplierId, reason } = input;

    const result = await prisma
      .$transaction(async (tx) => {
        const existingOffer = await OfferRepository.findById(offerId, tx);
        if (!existingOffer) throw new AppError("Offer not found", 404);
        if (existingOffer.supplierId !== supplierId) throw new AppError("Not allowed", 403);

        if (
          existingOffer.status !== OfferStatus.pending &&
          existingOffer.status !== OfferStatus.accepted
        ) {
          throw new AppError(
            "Only pending or accepted offers can be withdrawn by supplier",
            400,
          );
        }

        const relatedOrder = await tx.order.findUnique({
          where: { id: existingOffer.orderId },
        });
        if (!relatedOrder) throw new AppError("Associated order not found", 404);

        if (existingOffer.status === OfferStatus.pending) {
          const deletedOffer = await OfferRepository.withdrawPendingOfferBySupplier(
            offerId,
            supplierId,
            reason,
            tx,
          );
          if (!deletedOffer) {
            throw new AppError(
              "Offer not found, not owned by supplier, or cannot be withdrawn",
              404,
            );
          }
          return {
            deletedOffer,
            relatedOrder,
            relatedSession: null,
            flowType: "pending_withdraw" as const,
          };
        }

        const isScheduledOrder = relatedOrder.status === OrderStatus.scheduled;
        let relatedSession: any = null;

        if (!isScheduledOrder) {
          const activeRelatedSession = await tx.jobSession.findFirst({
            where: {
              offerId: existingOffer.id,
              status: { notIn: [SessionStatus.completed, SessionStatus.cancelled] },
            },
          });

          if (activeRelatedSession) {
            const cancelled = await SessionRepository.markCancelled(
              activeRelatedSession.id,
              activeRelatedSession.status,
              SESSION_CANCELLED_BY.SUPPLIER,
              "supplier_deleted_accepted_offer",
              tx,
            );
            relatedSession = cancelled || activeRelatedSession;
          }
        }

        const deletedOffer = await OfferRepository.withdrawAcceptedOfferBySupplier(
          offerId,
          supplierId,
          reason,
          tx,
        );
        if (!deletedOffer) throw new AppError("Accepted offer could not be withdrawn", 409);

        const resetOrder = await OrderRepository.resetToPending(relatedOrder.id, tx);
        if (!resetOrder) throw new AppError("Order state changed concurrently", 409);

        return {
          deletedOffer,
          relatedOrder,
          relatedSession,
          flowType: isScheduledOrder
            ? ("scheduled_cancel" as const)
            : ("accepted_cancel" as const),
        };
      })
      .catch((error: any) => {
        if (error?.code === "P2002") {
          throw new AppError(
            "State changed while withdrawing the offer. Please refresh and try again.",
            409,
          );
        }
        throw error;
      });

    const { deletedOffer, relatedOrder, relatedSession, flowType } = result;
    const io = getIO();

    if (flowType === "pending_withdraw") {
      io.to(socketRooms.user(relatedOrder.customerId)).emit(
        socketEvents.OFFER_DELETED,
        {
          offerId: deletedOffer.id,
          orderId: deletedOffer.orderId,
          supplierId,
          message: "A supplier has withdrawn their offer",
          timestamp: new Date(),
        },
      );

      io.to(socketRooms.user(supplierId)).emit(socketEvents.SUPPLIER_OFFER_WITHDRAWN, {
        offerId: deletedOffer.id,
        orderId: deletedOffer.orderId,
        reason: "user_deleted",
        timestamp: new Date(),
      });

      await Promise.all([
        OfferEventService.emitSupplierPendingCountUpdate(supplierId),
        OfferEventService.emitSupplierPendingOffersList(supplierId),
      ]);

      return {
        success: true,
        message: "Offer withdrawn successfully",
        data: { offerId: deletedOffer.id, orderId: deletedOffer.orderId },
      };
    }

    if (relatedSession) {
      SessionEventService.emitSessionCancelled(relatedSession, {
        actorRole: SESSION_CANCELLED_BY.SUPPLIER,
        actorId: supplierId,
        reason: "supplier_deleted_accepted_offer",
      });
      await SessionEventService.notifySessionCancelled(
        relatedSession,
        SESSION_CANCELLED_BY.SUPPLIER as "supplier",
      );
    }

    io.to(socketRooms.user(relatedOrder.customerId)).emit(
      socketEvents.OFFER_DELETED,
      {
        offerId: deletedOffer.id,
        orderId: deletedOffer.orderId,
        supplierId,
        message: "The supplier cancelled the accepted offer",
        reason: "supplier_deleted_accepted_offer",
        timestamp: new Date(),
      },
    );

    io.to(socketRooms.user(supplierId)).emit(socketEvents.SUPPLIER_OFFER_WITHDRAWN, {
      offerId: deletedOffer.id,
      orderId: deletedOffer.orderId,
      reason: "supplier_deleted_accepted_offer",
      timestamp: new Date(),
    });

    await Promise.all([
      OrderEventService.emitOrderAvailableAgain(
        relatedOrder.id,
        relatedOrder.categoryId,
        relatedOrder.governmentId,
        "supplier_deleted_accepted_offer",
      ),
      OfferEventService.emitSupplierPendingCountUpdate(supplierId),
      OfferEventService.emitSupplierPendingOffersList(supplierId),
    ]);

    return {
      success: true,
      message:
        flowType === "scheduled_cancel"
          ? "Scheduled booking cancelled, offer withdrawn, and order returned to pending"
          : "Accepted offer withdrawn, session cancelled, and order returned to pending",
      data: {
        offerId: deletedOffer.id,
        orderId: deletedOffer.orderId,
        sessionId: relatedSession?.id || null,
        orderStatus: ORDER_STATUS.PENDING,
        sessionStatus: relatedSession ? SESSION_STATUS.CANCELLED : null,
      },
    };
  }

  static async getOffersByOrder(input: {
    orderId: string;
    userId: string;
    role: string;
  }) {
    const { orderId, userId, role } = input;

    const order = await prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new AppError("Order not found", 404);

    if (role === "customer" && order.customerId !== userId) {
      throw new AppError("Not allowed", 403);
    }
    if (role === "supplier" && order.customerId === userId) {
      throw new AppError("Not allowed", 403);
    }

    const offers =
      role === "supplier"
        ? await OfferRepository.findSupplierOfferForOrder(orderId, userId)
        : await OfferRepository.findOrderOffers(orderId);

    const enrichedOffers = await Promise.all(
      offers.map(async (offer) => {
        const supplier = await prisma.user.findUnique({
          where: { id: offer.supplierId },
          select: userSelect,
        });
        return { ...offer, supplier: supplier || null };
      }),
    );

    return { success: true, data: enrichedOffers };
  }

  static async acceptOrderDirect(input: { orderId: string; supplierId: string }) {
    const { orderId, supplierId } = input;

    const result = await prisma
      .$transaction(async (tx) => {
        await this.ensureSupplierCanCreateOffer(supplierId, tx);

        const order = await tx.order.findUnique({ where: { id: orderId } });
        if (!order) throw new AppError("Order not found", 404);
        if (order.status !== OrderStatus.pending) {
          throw new AppError("Order already taken or not available", 409);
        }
        if (order.customerId === supplierId) {
          throw new AppError("You cannot accept your own order", 400);
        }
        if (!order.timeToStart) {
          throw new AppError("Order is missing timeToStart", 400);
        }

        const isDailyOrder = order.orderType === ORDER_TYPE.DAILY;
        const directTimeToStart = isDailyOrder
          ? normalizeDailyStart(order.timeToStart)
          : new Date(order.timeToStart);
        const directEstimatedDuration = isDailyOrder
          ? DAILY_DURATION_MINUTES
          : order.estimatedDuration!;

        const supplierPendingOffers = await OfferRepository.findPendingOffersBySupplier(
          supplierId,
          tx,
        );

        const offer = await OfferRepository.createOffer(
          {
            orderId,
            supplierId,
            amount: Number(order.requestedPrice),
            timeToStart: directTimeToStart,
            estimatedDuration: directEstimatedDuration,
            expectedDays: order.expectedDays,
            status: OfferStatus.accepted,
          },
          tx,
        );

        await OfferRepository.rejectOtherPendingOffersForSupplier(
          supplierId,
          offer.id,
          tx,
        );
        await OfferRepository.rejectOtherOffersForOrder(orderId, offer.id, tx);

        const isDirectScheduled = directTimeToStart > new Date();
        let sessionDoc: any = null;

        if (isDirectScheduled) {
          const duration = directEstimatedDuration;
          const [supplierConflict, customerConflict] = await Promise.all([
            this.checkSupplierTimeConflict(
              supplierId,
              directTimeToStart,
              duration,
              offer.id,
              tx,
            ),
            this.checkCustomerTimeConflict(
              order.customerId,
              directTimeToStart,
              duration,
              tx,
            ),
          ]);

          if (supplierConflict) {
            throw new AppError(
              `Time conflict: you have a booking at ${supplierConflict.start.toISOString()}`,
              409,
            );
          }
          if (customerConflict) {
            throw new AppError(
              `Customer has a conflicting booking at ${customerConflict.start.toISOString()}`,
              409,
            );
          }

          const updatedOrder = await OrderRepository.markScheduled(
            order.id,
            supplierId,
            Number(order.requestedPrice),
            directTimeToStart,
            directEstimatedDuration,
            tx,
          );
          if (!updatedOrder) throw new AppError("Order state changed concurrently", 409);
        } else {
          const updatedOrder = await OrderRepository.markInProgress(
            order.id,
            supplierId,
            Number(order.requestedPrice),
            tx,
          );
          if (!updatedOrder) throw new AppError("Order state changed concurrently", 409);

          const workflowSteps = await resolveWorkflowSteps(order, tx);

          sessionDoc = await SessionRepository.createSession(
            {
              orderId: order.id,
              offerId: offer.id,
              customerId: order.customerId,
              supplierId,
              workflowSteps,
              status: SESSION_STATUS.STARTED,
              startedAt: new Date(),
            },
            tx,
          );
        }

        return { order, offer, sessionDoc, supplierPendingOffers };
      })
      .catch((error: any) => {
        if (error?.code === "P2002") {
          throw new AppError(
            "Order or supplier active job state changed. Please refresh and try again.",
            409,
          );
        }
        throw error;
      });

    const { order, offer, sessionDoc, supplierPendingOffers } = result;
    const isDirectScheduled = !sessionDoc;
    const io = getIO();
    const orderPayload = await buildSupplierOrderPayload(order.id);
    const sessionPayload = sessionDoc
      ? {
          _id: sessionDoc.id,
          orderId: sessionDoc.orderId,
          offerId: sessionDoc.offerId,
          customerId: sessionDoc.customerId,
          supplierId: sessionDoc.supplierId,
          status: sessionDoc.status,
        }
      : null;

    [order.customerId, supplierId].forEach((uid) => {
      io.to(socketRooms.user(uid)).emit(socketEvents.ORDER_ACCEPTED_DIRECT, {
        orderId: order.id,
        supplierId,
        offerId: offer.id,
        sessionId: sessionDoc?.id || null,
        isScheduled: isDirectScheduled,
        scheduledAt: offer.timeToStart || null,
        order: orderPayload,
        session: sessionPayload,
        withdrawnOffersCount: supplierPendingOffers.length,
        timestamp: new Date(),
      });
    });

    if (!isDirectScheduled && sessionDoc) {
      [order.customerId, supplierId].forEach((uid) => {
        io.to(socketRooms.user(uid)).emit(socketEvents.SESSION_CREATED, {
          session: sessionPayload,
          order: orderPayload,
          offer: {
            _id: offer.id,
            orderId: offer.orderId,
            supplierId: offer.supplierId,
            amount: offer.amount,
            status: offer.status,
          },
          meta: { trigger: "order_accepted_direct", timestamp: new Date() },
        });
      });
    }

    await Promise.all([
      OfferEventService.emitSupplierPendingCountUpdate(supplierId),
      OfferEventService.emitSupplierPendingOffersList(supplierId),
      publishNotification({
        userId: order.customerId,
        type: OFFER_NOTIFICATION_TYPES.ORDER_ACCEPTED_DIRECT,
        title: "Order Accepted",
        message: `A supplier has directly accepted your order.`,
        data: {
          orderId: order.id,
          offerId: offer.id,
          supplierId,
          isScheduled: isDirectScheduled,
          scheduledAt: offer.timeToStart || null,
        },
      }),
      isDirectScheduled
        ? Promise.all([
            publishNotification({
              userId: order.customerId,
              type: SESSION_NOTIFICATION_TYPES.SESSION_SCHEDULED,
              title: "Job Scheduled",
              message: `Your job has been scheduled for ${offer.timeToStart?.toISOString()}.`,
              data: {
                orderId: order.id,
                offerId: offer.id,
                scheduledAt: offer.timeToStart,
              },
            }),
            publishNotification({
              userId: supplierId,
              type: SESSION_NOTIFICATION_TYPES.SESSION_SCHEDULED,
              title: "Job Scheduled",
              message: `You have a scheduled job on ${offer.timeToStart?.toISOString()}.`,
              data: {
                orderId: order.id,
                offerId: offer.id,
                scheduledAt: offer.timeToStart,
              },
            }),
          ])
        : SessionEventService.notifySessionCreated(sessionDoc),
    ]);

    return {
      success: true,
      message: isDirectScheduled
        ? "Order accepted and job scheduled"
        : "Order accepted successfully",
      isScheduled: isDirectScheduled,
      scheduledAt: isDirectScheduled ? offer.timeToStart : null,
      offer: {
        _id: offer.id,
        orderId: offer.orderId,
        supplierId: offer.supplierId,
        amount: offer.amount,
        status: offer.status,
      },
      session: sessionPayload,
      order: orderPayload,
      withdrawnOffers: {
        count: supplierPendingOffers.length,
        orders: supplierPendingOffers.map((o: any) => o.orderId),
      },
    };
  }

  static async getAcceptedOfferHistory(input: {
    supplierId: string;
    page?: number;
    limit?: number;
  }) {
    const { supplierId, page = 1, limit = 20 } = input;

    const [offers, total] = await Promise.all([
      OfferRepository.findSupplierAcceptedOffersHistory(supplierId, page, limit),
      OfferRepository.countSupplierAcceptedOffersHistory(supplierId),
    ]);

    const enrichedOffers = await Promise.all(
      offers.map(async (offer) => {
        const [order, session] = await Promise.all([
          prisma.order.findUnique({ where: { id: offer.orderId } }),
          prisma.jobSession.findFirst({ where: { offerId: offer.id } }),
        ]);
        return { ...offer, order: order || null, session: session || null };
      }),
    );

    return {
      success: true,
      data: enrichedOffers,
      meta: {
        page,
        limit,
        total,
        count: enrichedOffers.length,
        hasNextPage: page * limit < total,
      },
    };
  }

  static async getSupplierPendingOffers(input: {
    supplierId: string;
    page?: number;
    limit?: number;
  }) {
    const { supplierId, page = 1, limit = 20 } = input;

    const [offers, total, activeAcceptedOffer] = await Promise.all([
      OfferRepository.findSupplierPendingOffersPaginated(supplierId, page, limit),
      OfferRepository.countPendingOffersBySupplier(supplierId),
      OfferRepository.findAcceptedOfferBySupplier(supplierId),
    ]);

    const enrichedOffers = await Promise.all(
      offers.map(async (offer) => {
        const order = await prisma.order.findUnique({ where: { id: offer.orderId } });
        return { ...offer, order: order || null };
      }),
    );

    return {
      success: true,
      data: enrichedOffers,
      meta: {
        page,
        limit,
        total,
        count: enrichedOffers.length,
        hasNextPage: page * limit < total,
      },
      stats: {
        totalPending: total,
        hasActiveJob: !!activeAcceptedOffer,
      },
    };
  }
}
