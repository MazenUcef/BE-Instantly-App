import mongoose from "mongoose";
import UserModel from "../../auth/models/User.model";
import orderModel from "../../order/models/Order.model";
import sessionModel from "../../session/models/session.model";
import CategoryModel from "../../category/models/Category.model";
import { AppError } from "../../../shared/middlewares/errorHandler";
import { OfferEventService } from "./offer-event.service";
import { ORDER_STATUS } from "../../../shared/constants/order.constants";
import { OFFER_STATUS } from "../../../shared/constants/offer.constants";
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
import { SESSION_STATUS, SESSION_CANCELLED_BY, SESSION_NOTIFICATION_TYPES } from "../../../shared/constants/session.constants";
import { findTimeConflict, TimeWindow } from "../../../shared/utils/time-conflict";
import { publishNotification } from "../../notification/notification.publisher";
import BundleBookingModel from "../../bundleBooking/models/bundleBooking.model";
import { BUNDLE_BOOKING_ACTIVE_SLOT_STATUSES } from "../../../shared/constants/bundleBooking.constants";
import { parseTimeToMinutes } from "../../../shared/utils/calendar";

async function resolveWorkflowSteps(order: any, dbSession: any): Promise<string[]> {
  const category = await CategoryModel.findById(order.categoryId).session(dbSession || null);
  if (!category) throw new AppError("Category not found", 404);
  const workflow = category.workflows?.find((w) => w.key === order.selectedWorkflow);
  if (!workflow) throw new AppError("Workflow not found for this order's category", 400);
  return workflow.steps;
}

export class OfferService {
  private static async ensureSupplierCanCreateOffer(
    supplierId: string,
    dbSession?: any,
  ) {
    const [reviewRequiredOrder, activeSession] = await Promise.all([
      orderModel.findOne({
        supplierId,
        status: ORDER_STATUS.COMPLETED,
        supplierReviewed: false,
      })
        .sort({ updatedAt: -1 })
        .session(dbSession || null),
      sessionModel.findOne({
        supplierId,
        status: { $nin: [SESSION_STATUS.COMPLETED, SESSION_STATUS.CANCELLED] },
      }).session(dbSession || null),
    ]);

    if (reviewRequiredOrder) {
      const session = await sessionModel
        .findOne({ orderId: reviewRequiredOrder._id })
        .session(dbSession || null);

      let customer = null;
      if (session?.customerId) {
        customer = await UserModel.findById(session.customerId).select(
          "-password -refreshToken -biometrics",
        );
      }

      const error = new AppError(
        "You must review your last completed job before creating a new offer.",
        403,
      );
      (error as any).reviewRequired = true;
      (error as any).order = { ...reviewRequiredOrder.toObject(), customer };
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
    excludeOfferId?: string,
    dbSession?: any,
  ) {
    const dateStr = timeToStart.toISOString().split("T")[0];

    const [offerWindows, bundleBookings] = await Promise.all([
      OfferRepository.findSupplierScheduledWindows(supplierId, excludeOfferId, dbSession),
      BundleBookingModel.find({
        supplierId,
        bookedDate: dateStr,
        status: { $in: [...BUNDLE_BOOKING_ACTIVE_SLOT_STATUSES] },
      }).session(dbSession || null),
    ]);

    const mapped: TimeWindow[] = offerWindows.map((w: any) => ({
      start: w.timeToStart,
      durationMinutes: w.estimatedDuration,
      referenceId: w._id.toString(),
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
        referenceId: (b._id as any).toString(),
      });
    }

    return findTimeConflict(mapped, timeToStart, estimatedDuration);
  }

  private static async checkCustomerTimeConflict(
    customerId: string,
    timeToStart: Date,
    estimatedDuration: number,
    dbSession?: any,
  ) {
    const dateStr = timeToStart.toISOString().split("T")[0];

    const [orderWindows, bundleBookings] = await Promise.all([
      OrderRepository.findCustomerScheduledWindows(customerId, dbSession),
      BundleBookingModel.find({
        customerId,
        bookedDate: dateStr,
        status: { $in: [...BUNDLE_BOOKING_ACTIVE_SLOT_STATUSES] },
      }).session(dbSession || null),
    ]);

    const mapped: TimeWindow[] = orderWindows.map((w: any) => ({
      start: w.scheduledAt,
      durationMinutes: w.estimatedDuration,
      referenceId: w._id.toString(),
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
        referenceId: (b._id as any).toString(),
      });
    }

    return findTimeConflict(mapped, timeToStart, estimatedDuration);
  }

  private static async validateOrderForOfferCreation(orderId: string) {
    const order = await orderModel.findById(orderId);

    if (!order) {
      throw new AppError("Order not found", 404);
    }

    if (order.status !== ORDER_STATUS.PENDING) {
      throw new AppError("Only pending orders can receive offers", 400);
    }

    return order;
  }

  static async createOffer(input: {
    supplierId: string;
    orderId: string;
    amount: number;
    estimatedDuration?: number | null;
    timeToStart?: string | Date | null;
  }) {
    const { supplierId, orderId, amount, estimatedDuration, timeToStart } = input;

    if (!amount || amount <= 0) {
      throw new AppError("Offer amount must be greater than 0", 400);
    }

    const dbSession = await mongoose.startSession();
    let order: any;
    let offer: any;
    let created = false;

    try {
      await dbSession.withTransaction(async () => {
        await this.ensureSupplierCanCreateOffer(supplierId, dbSession);

        order = await orderModel.findById(orderId).session(dbSession || null);
        if (!order) {
          throw new AppError("Order not found", 404);
        }

        if (order.status !== ORDER_STATUS.PENDING) {
          throw new AppError("Cannot create offer for this order now", 400);
        }

        if (order.customerId.toString() === supplierId) {
          throw new AppError(
            "You cannot create an offer on your own order",
            400,
          );
        }

        if (timeToStart && estimatedDuration) {
          const parsedStart = new Date(timeToStart);
          if (parsedStart > new Date()) {
            const conflict = await this.checkSupplierTimeConflict(
              supplierId, parsedStart, estimatedDuration, undefined, dbSession,
            );
            if (conflict) {
              throw new AppError(
                `Time conflict: you already have a booking starting at ${conflict.start.toISOString()} for ${conflict.durationMinutes} minutes`,
                409,
              );
            }
          }
        }

        const existingOffer =
          await OfferRepository.findPendingOfferBySupplierAndOrder(
            supplierId,
            orderId,
            dbSession,
          );

        if (existingOffer) {
          offer = await OfferRepository.updatePendingOffer(
            existingOffer._id,
            {
              amount,
              estimatedDuration,
              timeToStart,
              expiresAt: null,
            },
            dbSession,
          );
          created = false;
        } else {
          offer = await OfferRepository.createOffer(
            {
              orderId,
              supplierId,
              amount,
              estimatedDuration,
              timeToStart,
              expiresAt: null,
              status: OFFER_STATUS.PENDING,
            },
            dbSession,
          );
          created = true;
        }
      });
    } catch (error: any) {
      if (error?.code === 11000) {
        throw new AppError(
          "A pending offer for this order already exists for this supplier.",
          409,
        );
      }
      throw error;
    } finally {
      await dbSession.endSession();
    }

    const payload = created
      ? await OfferEventService.emitOfferCreatedToCustomer({
          customerId: order.customerId.toString(),
          offer,
        })
      : await OfferEventService.emitOfferUpdatedToCustomer({
          customerId: order.customerId.toString(),
          offer,
        });

    const io = getIO();
    io.to(socketRooms.user(supplierId)).emit(
      created
        ? socketEvents.SUPPLIER_OFFER_CREATED
        : socketEvents.SUPPLIER_OFFER_UPDATED,
      {
        offer: payload,
        timestamp: new Date(),
      },
    );

    await Promise.all([
      OfferEventService.emitSupplierPendingCountUpdate(supplierId),
      OfferEventService.emitSupplierPendingOffersList(supplierId),
      OfferEventService.notifyCustomerNewOffer({
        customerId: order.customerId.toString(),
        orderId: order._id.toString(),
        offerId: offer._id.toString(),
        supplierId,
        amount,
        estimatedDuration,
        timeToStart,
      }),
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

    const dbSession = await mongoose.startSession();
    let offer: any;
    let order: any;
    let sessionDoc: any;
    let supplierOtherPendingOffers: any[] = [];
    let rejectedOrderOffers: any[] = [];

    try {
      await dbSession.withTransaction(async () => {
        const existingOffer = await OfferRepository.findById(
          offerId,
          dbSession,
        );

        if (!existingOffer) {
          throw new AppError("Offer not found", 404);
        }

        if (existingOffer.status !== OFFER_STATUS.PENDING) {
          throw new AppError("Offer not found or already processed", 409);
        }

        order = await orderModel.findById(existingOffer.orderId).session(
          dbSession || null,
        );

        if (!order) {
          throw new AppError("Associated order not found", 404);
        }

        if (order.customerId.toString() !== customerId) {
          throw new AppError("Not allowed", 403);
        }

        if (order.status !== ORDER_STATUS.PENDING) {
          throw new AppError(
            "Order is not available for offer acceptance",
            409,
          );
        }

        offer = await OfferRepository.acceptPendingOffer(offerId, dbSession);
        if (!offer) {
          throw new AppError("Offer not found or already processed", 409);
        }

        supplierOtherPendingOffers =
          await OfferRepository.findSupplierOtherPendingOffers(
            offer.supplierId,
            offer._id,
            dbSession,
          );

        rejectedOrderOffers = await OfferRepository.findPendingOffersByOrder(
          order._id,
          dbSession,
        );

        await OfferRepository.rejectOtherPendingOffersForSupplier(
          offer.supplierId,
          offer._id,
          dbSession,
        );

        await OfferRepository.rejectOtherOffersForOrder(
          order._id,
          offer._id,
          dbSession,
        );

        const offerStartTime: Date | null = offer.timeToStart
          ? new Date(offer.timeToStart)
          : null;
        const isScheduled = offerStartTime && offerStartTime > new Date();

        if (isScheduled) {
          const duration = offer.estimatedDuration ?? 60;

          const [supplierConflict, customerConflict] = await Promise.all([
            this.checkSupplierTimeConflict(
              offer.supplierId.toString(), offerStartTime, duration, offer._id.toString(), dbSession,
            ),
            this.checkCustomerTimeConflict(
              order.customerId.toString(), offerStartTime, duration, dbSession,
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
            order._id, offer.supplierId, offer.amount,
            offerStartTime, offer.estimatedDuration ?? null, dbSession,
          );

          if (!updatedOrder) {
            throw new AppError("Order state changed concurrently", 409);
          }
        } else {
          const updatedOrder = await OrderRepository.markInProgress(
            order._id, offer.supplierId, offer.amount, dbSession,
          );

          if (!updatedOrder) {
            throw new AppError("Order state changed concurrently", 409);
          }

          const workflowSteps = await resolveWorkflowSteps(order, dbSession);

          sessionDoc = await SessionRepository.createSession(
            {
              orderId: order._id,
              offerId: offer._id,
              customerId: order.customerId,
              supplierId: offer.supplierId,
              workflowSteps,
              status: SESSION_STATUS.STARTED,
              startedAt: new Date(),
            },
            dbSession,
          );
        }
      });
    } catch (error: any) {
      if (error?.code === 11000) {
        throw new AppError(
          "This offer or supplier active job state changed. Please refresh and try again.",
          409,
        );
      }
      throw error;
    } finally {
      await dbSession.endSession();
    }

    const io = getIO();
    const isScheduled = !sessionDoc;

    const orderPayload = await buildSupplierOrderPayload(order._id.toString());
    const sessionPayload = sessionDoc
      ? {
          _id: sessionDoc._id.toString(),
          orderId: sessionDoc.orderId.toString(),
          offerId: sessionDoc.offerId.toString(),
          customerId: sessionDoc.customerId.toString(),
          supplierId: sessionDoc.supplierId.toString(),
          status: sessionDoc.status,
        }
      : null;

    const offerMeta = {
      _id: offer._id.toString(),
      orderId: offer.orderId.toString(),
      supplierId: offer.supplierId.toString(),
      amount: offer.amount,
      status: offer.status,
      scheduledAt: offer.timeToStart || null,
      estimatedDuration: offer.estimatedDuration || null,
    };

    [offer.supplierId.toString(), order.customerId.toString()].forEach((uid) => {
      io.to(socketRooms.user(uid)).emit(socketEvents.OFFER_ACCEPTED, {
        offerId: offer._id.toString(),
        orderId: offer.orderId.toString(),
        supplierId: offer.supplierId.toString(),
        sessionId: sessionDoc?._id?.toString() || null,
        isScheduled,
        scheduledAt: offer.timeToStart || null,
        order: orderPayload,
        session: sessionPayload,
        timestamp: new Date(),
      });
    });

    if (!isScheduled) {
      [order.customerId.toString(), offer.supplierId.toString()].forEach((uid) => {
        io.to(socketRooms.user(uid)).emit(socketEvents.SESSION_CREATED, {
          session: sessionPayload,
          order: orderPayload,
          offer: offerMeta,
          meta: { trigger: "offer_accepted", timestamp: new Date() },
        });
      });
    }

    for (const pendingOffer of supplierOtherPendingOffers) {
      const pendingOrder = await orderModel.findById(pendingOffer.orderId);
      if (!pendingOrder) continue;

      io.to(socketRooms.user(pendingOrder.customerId.toString())).emit(
        socketEvents.OFFER_DELETED,
        {
          offerId: pendingOffer._id.toString(),
          orderId: pendingOffer.orderId.toString(),
          supplierId: offer.supplierId.toString(),
          message: "Supplier withdrew their offer as they accepted another job",
          acceptedOrderId: order._id.toString(),
          timestamp: new Date(),
        },
      );
    }

    await Promise.all([
      OfferEventService.emitSupplierPendingCountUpdate(offer.supplierId.toString()),
      OfferEventService.emitSupplierPendingOffersList(offer.supplierId.toString()),
      OfferEventService.notifySupplierOfferAccepted({
        supplierId: offer.supplierId.toString(),
        orderId: order._id.toString(),
        offerId: offer._id.toString(),
        sessionId: sessionDoc?._id?.toString() || null,
        withdrawnOrderIds: supplierOtherPendingOffers.map((o) => o.orderId.toString()),
      }),
      isScheduled
        ? Promise.all([
            publishNotification({
              userId: order.customerId.toString(),
              type: SESSION_NOTIFICATION_TYPES.SESSION_SCHEDULED,
              title: "Job Scheduled",
              message: `Your job has been scheduled for ${offer.timeToStart?.toISOString()}.`,
              data: { orderId: order._id.toString(), offerId: offer._id.toString(), scheduledAt: offer.timeToStart },
            }),
            publishNotification({
              userId: offer.supplierId.toString(),
              type: SESSION_NOTIFICATION_TYPES.SESSION_SCHEDULED,
              title: "Job Scheduled",
              message: `You have a scheduled job on ${offer.timeToStart?.toISOString()}.`,
              data: { orderId: order._id.toString(), offerId: offer._id.toString(), scheduledAt: offer.timeToStart },
            }),
          ])
        : SessionEventService.notifySessionCreated(sessionDoc),
    ]);

    return {
      success: true,
      message: isScheduled ? "Offer accepted and job scheduled" : "Offer accepted successfully",
      isScheduled,
      scheduledAt: isScheduled ? offer.timeToStart : null,
      offer: {
        _id: offer._id.toString(),
        orderId: offer.orderId.toString(),
        supplierId: offer.supplierId.toString(),
        amount: offer.amount,
        status: offer.status,
      },
      session: sessionPayload,
      order: orderPayload,
      withdrawnOffers: {
        count: supplierOtherPendingOffers.length,
        orders: supplierOtherPendingOffers.map((o) => o.orderId.toString()),
      },
    };
  }

  static async rejectOffer(input: { offerId: string; customerId: string }) {
    const { offerId, customerId } = input;

    const dbSession = await mongoose.startSession();
    let rejectedOffer: any;
    let order: any;

    try {
      await dbSession.withTransaction(async () => {
        const offer = await OfferRepository.findById(offerId, dbSession);
        if (!offer) {
          throw new AppError("Offer not found", 404);
        }

        order = await orderModel.findById(offer.orderId).session(dbSession);
        if (!order) {
          throw new AppError("Associated order not found", 404);
        }

        if (order.customerId.toString() !== customerId) {
          throw new AppError("Not allowed", 403);
        }

        if (order.status !== ORDER_STATUS.PENDING) {
          throw new AppError("Cannot reject offer for this order now", 400);
        }

        rejectedOffer = await OfferRepository.rejectPendingOffer(offerId, dbSession);
        if (!rejectedOffer) {
          throw new AppError("Offer not found or already processed", 409);
        }
      });
    } finally {
      await dbSession.endSession();
    }

    const io = getIO();

    io.to(socketRooms.user(rejectedOffer.supplierId.toString())).emit(
      socketEvents.OFFER_REJECTED,
      {
        offerId: rejectedOffer._id.toString(),
        orderId: rejectedOffer.orderId.toString(),
        reason: "customer_rejected",
        timestamp: new Date(),
      },
    );

    await Promise.all([
      OfferEventService.emitSupplierPendingCountUpdate(
        rejectedOffer.supplierId.toString(),
      ),
      OfferEventService.emitSupplierPendingOffersList(
        rejectedOffer.supplierId.toString(),
      ),
      OfferEventService.emitOrderAvailableAgain(
        rejectedOffer.orderId.toString(),
      ),
      OfferEventService.notifySupplierOfferRejected({
        supplierId: rejectedOffer.supplierId.toString(),
        offerId: rejectedOffer._id.toString(),
        orderId: rejectedOffer.orderId.toString(),
      }),
    ]);

    return {
      success: true,
      message: "Offer rejected successfully",
      offer: rejectedOffer,
    };
  }

  static async deleteOffer(input: { offerId: string; supplierId: string }) {
    const { offerId, supplierId } = input;

    const dbSession = await mongoose.startSession();

    let deletedOffer: any = null;
    let relatedOrder: any = null;
    let relatedSession: any = null;
    let flowType: "pending_withdraw" | "accepted_cancel" | "scheduled_cancel" | null = null;

    try {
      await dbSession.withTransaction(async () => {
        const existingOffer = await OfferRepository.findById(
          offerId,
          dbSession,
        );

        if (!existingOffer) {
          throw new AppError("Offer not found", 404);
        }

        if (existingOffer.supplierId.toString() !== supplierId) {
          throw new AppError("Not allowed", 403);
        }

        if (
          ![OFFER_STATUS.PENDING, OFFER_STATUS.ACCEPTED].includes(
            existingOffer.status as any,
          )
        ) {
          throw new AppError(
            "Only pending or accepted offers can be withdrawn by supplier",
            400,
          );
        }

        relatedOrder = await orderModel.findById(existingOffer.orderId).session(
          dbSession || null,
        );

        if (!relatedOrder) {
          throw new AppError("Associated order not found", 404);
        }

        if (existingOffer.status === OFFER_STATUS.PENDING) {
          deletedOffer = await OfferRepository.withdrawPendingOfferBySupplier(
            offerId,
            supplierId,
            dbSession,
          );

          if (!deletedOffer) {
            throw new AppError(
              "Offer not found, not owned by supplier, or cannot be withdrawn",
              404,
            );
          }

          flowType = "pending_withdraw";
          return;
        }

        // accepted offer flow
        const isScheduledOrder = relatedOrder.status === ORDER_STATUS.SCHEDULED;

        if (!isScheduledOrder) {
          // IN_PROGRESS — may have an active session
          const activeRelatedSession = await sessionModel
            .findOne({
              offerId: existingOffer._id,
              status: {
                $nin: [SESSION_STATUS.COMPLETED, SESSION_STATUS.CANCELLED],
              },
            })
            .session(dbSession || null);

          if (activeRelatedSession) {
            const cancelled = await SessionRepository.markCancelled(
              activeRelatedSession._id,
              activeRelatedSession.status,
              SESSION_CANCELLED_BY.SUPPLIER,
              "supplier_deleted_accepted_offer",
              dbSession,
            );
            relatedSession = cancelled || activeRelatedSession;
            relatedSession.status = SESSION_STATUS.CANCELLED;
            relatedSession.cancelledBy = SESSION_CANCELLED_BY.SUPPLIER;
            relatedSession.cancellationReason = "supplier_deleted_accepted_offer";
          }
        }

        deletedOffer = await OfferRepository.withdrawAcceptedOfferBySupplier(
          offerId,
          supplierId,
          dbSession,
        );

        if (!deletedOffer) {
          throw new AppError("Accepted offer could not be withdrawn", 409);
        }

        const resetOrder = await OrderRepository.resetToPending(relatedOrder._id, dbSession);
        if (!resetOrder) {
          throw new AppError("Order state changed concurrently", 409);
        }

        flowType = isScheduledOrder ? "scheduled_cancel" : "accepted_cancel";
      });
    } catch (error: any) {
      if (error?.code === 11000) {
        throw new AppError(
          "State changed while withdrawing the offer. Please refresh and try again.",
          409,
        );
      }
      throw error;
    } finally {
      await dbSession.endSession();
    }

    const io = getIO();

    if (flowType === "pending_withdraw") {
      io.to(socketRooms.user(relatedOrder.customerId.toString())).emit(
        socketEvents.OFFER_DELETED,
        {
          offerId: deletedOffer._id.toString(),
          orderId: deletedOffer.orderId.toString(),
          supplierId,
          message: "A supplier has withdrawn their offer",
          timestamp: new Date(),
        },
      );

      io.to(socketRooms.user(supplierId)).emit(
        socketEvents.SUPPLIER_OFFER_WITHDRAWN,
        {
          offerId: deletedOffer._id.toString(),
          orderId: deletedOffer.orderId.toString(),
          reason: "user_deleted",
          timestamp: new Date(),
        },
      );

      await Promise.all([
        OfferEventService.emitSupplierPendingCountUpdate(supplierId),
        OfferEventService.emitSupplierPendingOffersList(supplierId),
      ]);

      return {
        success: true,
        message: "Offer withdrawn successfully",
        data: {
          offerId: deletedOffer._id.toString(),
          orderId: deletedOffer.orderId.toString(),
        },
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
        SESSION_CANCELLED_BY.SUPPLIER,
      );
    }

    io.to(socketRooms.user(relatedOrder.customerId.toString())).emit(
      socketEvents.OFFER_DELETED,
      {
        offerId: deletedOffer._id.toString(),
        orderId: deletedOffer.orderId.toString(),
        supplierId,
        message: "The supplier cancelled the accepted offer",
        reason: "supplier_deleted_accepted_offer",
        timestamp: new Date(),
      },
    );

    io.to(socketRooms.user(supplierId)).emit(
      socketEvents.SUPPLIER_OFFER_WITHDRAWN,
      {
        offerId: deletedOffer._id.toString(),
        orderId: deletedOffer.orderId.toString(),
        reason: "supplier_deleted_accepted_offer",
        timestamp: new Date(),
      },
    );

    await Promise.all([
      OrderEventService.emitOrderAvailableAgain(
        relatedOrder._id.toString(),
        relatedOrder.categoryId.toString(),
        relatedOrder.governmentId.toString(),
        "supplier_deleted_accepted_offer",
      ),
      OfferEventService.emitSupplierPendingCountUpdate(supplierId),
      OfferEventService.emitSupplierPendingOffersList(supplierId),
    ]);

    return {
      success: true,
      message: flowType === "scheduled_cancel"
        ? "Scheduled booking cancelled, offer withdrawn, and order returned to pending"
        : "Accepted offer withdrawn, session cancelled, and order returned to pending",
      data: {
        offerId: deletedOffer._id.toString(),
        orderId: deletedOffer.orderId.toString(),
        sessionId: relatedSession?._id?.toString() || null,
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

    const order = await orderModel.findById(orderId);
    if (!order) {
      throw new AppError("Order not found", 404);
    }

    if (role === "customer" && order.customerId.toString() !== userId) {
      throw new AppError("Not allowed", 403);
    }

    if (role === "supplier" && order.customerId.toString() === userId) {
      throw new AppError("Not allowed", 403);
    }

    const offers = role === "supplier"
      ? await OfferRepository.findSupplierOfferForOrder(orderId, userId)
      : await OfferRepository.findOrderOffers(orderId);

    const enrichedOffers = await Promise.all(
      offers.map(async (offer: any) => {
        const supplier = await UserModel.findById(offer.supplierId).select(
          "-password -refreshToken -biometrics",
        );

        return {
          ...offer.toObject(),
          supplier: supplier || null,
        };
      }),
    );

    return {
      success: true,
      data: enrichedOffers,
    };
  }

  static async acceptOrderDirect(input: {
    orderId: string;
    supplierId: string;
    timeToStart?: string | Date | null;
    estimatedDuration?: number | null;
  }) {
    const { orderId, supplierId, timeToStart, estimatedDuration } = input;

    const dbSession = await mongoose.startSession();
    let order: any;
    let offer: any;
    let sessionDoc: any;
    let supplierPendingOffers: any[] = [];

    try {
      await dbSession.withTransaction(async () => {
        await this.ensureSupplierCanCreateOffer(supplierId, dbSession);

        order = await orderModel.findById(orderId).session(dbSession || null);

        if (!order) {
          throw new AppError("Order not found", 404);
        }

        if (order.status !== ORDER_STATUS.PENDING) {
          throw new AppError("Order already taken or not available", 409);
        }

        if (order.customerId.toString() === supplierId) {
          throw new AppError("You cannot accept your own order", 400);
        }

        supplierPendingOffers =
          await OfferRepository.findPendingOffersBySupplier(
            supplierId,
            dbSession,
          );

        offer = await OfferRepository.createOffer(
          {
            orderId,
            supplierId,
            amount: order.requestedPrice,
            timeToStart: timeToStart || null,
            estimatedDuration: estimatedDuration || null,
            status: OFFER_STATUS.ACCEPTED,
          },
          dbSession,
        );

        await OfferRepository.rejectOtherPendingOffersForSupplier(
          supplierId,
          offer._id,
          dbSession,
        );

        await OfferRepository.rejectOtherOffersForOrder(
          orderId,
          offer._id,
          dbSession,
        );

        const directStartTime = timeToStart ? new Date(timeToStart) : null;
        const isDirectScheduled = directStartTime && directStartTime > new Date();

        if (isDirectScheduled) {
          const duration = estimatedDuration ?? 60;

          const [supplierConflict, customerConflict] = await Promise.all([
            this.checkSupplierTimeConflict(
              supplierId, directStartTime, duration, offer._id.toString(), dbSession,
            ),
            this.checkCustomerTimeConflict(
              order.customerId.toString(), directStartTime, duration, dbSession,
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
            order._id, supplierId, order.requestedPrice,
            directStartTime, estimatedDuration ?? null, dbSession,
          );
          if (!updatedOrder) throw new AppError("Order state changed concurrently", 409);
        } else {
          const updatedOrder = await OrderRepository.markInProgress(
            order._id, supplierId, order.requestedPrice, dbSession,
          );
          if (!updatedOrder) throw new AppError("Order state changed concurrently", 409);

          const workflowSteps = await resolveWorkflowSteps(order, dbSession);

          sessionDoc = await SessionRepository.createSession(
            {
              orderId: order._id,
              offerId: offer._id,
              customerId: order.customerId,
              supplierId,
              workflowSteps,
              status: SESSION_STATUS.STARTED,
              startedAt: new Date(),
            },
            dbSession,
          );
        }
      });
    } catch (error: any) {
      if (error?.code === 11000) {
        throw new AppError(
          "Order or supplier active job state changed. Please refresh and try again.",
          409,
        );
      }
      throw error;
    } finally {
      await dbSession.endSession();
    }

    const isDirectScheduled = !sessionDoc;
    const io = getIO();
    const orderPayload = await buildSupplierOrderPayload(order._id.toString());
    const sessionPayload = sessionDoc ? {
      _id: sessionDoc._id.toString(),
      orderId: sessionDoc.orderId.toString(),
      offerId: sessionDoc.offerId.toString(),
      customerId: sessionDoc.customerId.toString(),
      supplierId: sessionDoc.supplierId.toString(),
      status: sessionDoc.status,
    } : null;

    [order.customerId.toString(), supplierId.toString()].forEach((uid) => {
      io.to(socketRooms.user(uid)).emit(socketEvents.ORDER_ACCEPTED_DIRECT, {
        orderId: order._id.toString(),
        supplierId: supplierId.toString(),
        offerId: offer._id.toString(),
        sessionId: sessionDoc?._id?.toString() || null,
        isScheduled: isDirectScheduled,
        scheduledAt: offer.timeToStart || null,
        order: orderPayload,
        session: sessionPayload,
        withdrawnOffersCount: supplierPendingOffers.length,
        timestamp: new Date(),
      });
    });

    if (!isDirectScheduled && sessionDoc) {
      [order.customerId.toString(), supplierId.toString()].forEach((uid) => {
        io.to(socketRooms.user(uid)).emit(socketEvents.SESSION_CREATED, {
          session: sessionPayload,
          order: orderPayload,
          offer: {
            _id: offer._id.toString(),
            orderId: offer.orderId.toString(),
            supplierId: offer.supplierId.toString(),
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
      isDirectScheduled
        ? Promise.all([
            publishNotification({
              userId: order.customerId.toString(),
              type: SESSION_NOTIFICATION_TYPES.SESSION_SCHEDULED,
              title: "Job Scheduled",
              message: `Your job has been scheduled for ${offer.timeToStart?.toISOString()}.`,
              data: { orderId: order._id.toString(), offerId: offer._id.toString(), scheduledAt: offer.timeToStart },
            }),
            publishNotification({
              userId: supplierId,
              type: SESSION_NOTIFICATION_TYPES.SESSION_SCHEDULED,
              title: "Job Scheduled",
              message: `You have a scheduled job on ${offer.timeToStart?.toISOString()}.`,
              data: { orderId: order._id.toString(), offerId: offer._id.toString(), scheduledAt: offer.timeToStart },
            }),
          ])
        : SessionEventService.notifySessionCreated(sessionDoc),
    ]);

    return {
      success: true,
      message: isDirectScheduled ? "Order accepted and job scheduled" : "Order accepted successfully",
      isScheduled: isDirectScheduled,
      scheduledAt: isDirectScheduled ? offer.timeToStart : null,
      offer: {
        _id: offer._id.toString(),
        orderId: offer.orderId.toString(),
        supplierId: offer.supplierId.toString(),
        amount: offer.amount,
        status: offer.status,
      },
      session: sessionPayload,
      order: orderPayload,
      withdrawnOffers: {
        count: supplierPendingOffers.length,
        orders: supplierPendingOffers.map((o) => o.orderId.toString()),
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
      OfferRepository.findSupplierAcceptedOffersHistory(
        supplierId,
        page,
        limit,
      ),
      OfferRepository.countSupplierAcceptedOffersHistory(supplierId),
    ]);

    const enrichedOffers = await Promise.all(
      offers.map(async (offer: any) => {
        const [order, session] = await Promise.all([
          orderModel.findById(offer.orderId),
          sessionModel.findOne({ offerId: offer._id }),
        ]);

        return {
          ...offer.toObject(),
          order: order || null,
          session: session || null,
        };
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
      OfferRepository.findSupplierPendingOffersPaginated(
        supplierId,
        page,
        limit,
      ),
      OfferRepository.countPendingOffersBySupplier(supplierId),
      OfferRepository.findAcceptedOfferBySupplier(supplierId),
    ]);

    const enrichedOffers = await Promise.all(
      offers.map(async (offer: any) => {
        const order = await orderModel.findById(offer.orderId).lean();

        return {
          ...offer.toObject(),
          order: order || null,
        };
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
