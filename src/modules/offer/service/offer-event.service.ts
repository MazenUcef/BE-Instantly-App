import prisma from "../../../shared/config/prisma";
import { getIO, socketEvents, socketRooms } from "../../../shared/config/socket";
import { publishNotification } from "../../notification/notification.publisher";
import { buildSupplierOrderPayload } from "../../../shared/utils/buildSupplierOrderPayload";
import { OFFER_NOTIFICATION_TYPES } from "../../../shared/constants/offer.constants";
import { OfferRepository } from "../repository/offer.repository";

export class OfferEventService {
  static async buildOfferPayload(offer: any) {
    const supplier = await prisma.user.findUnique({
      where: { id: offer.supplierId },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        profilePicture: true,
        averageRating: true,
        totalReviews: true,
      },
    });

    return { ...offer, supplier: supplier || null };
  }

  static async emitOfferCreatedToCustomer(input: {
    customerId: string;
    offer: any;
  }) {
    const io = getIO();
    const payload = await this.buildOfferPayload(input.offer);

    io.to(socketRooms.user(input.customerId)).emit(
      socketEvents.OFFER_NEW,
      payload,
    );

    return payload;
  }

  static async emitOfferUpdatedToCustomer(input: {
    customerId: string;
    offer: any;
  }) {
    const io = getIO();
    const payload = await this.buildOfferPayload(input.offer);

    io.to(socketRooms.user(input.customerId)).emit(
      socketEvents.OFFER_UPDATED,
      payload,
    );

    return payload;
  }

  static async emitSupplierPendingCountUpdate(supplierId: string) {
    const io = getIO();
    const pendingOffersCount = await OfferRepository.countPendingOffersBySupplier(
      supplierId,
    );

    io.to(socketRooms.user(supplierId)).emit(
      socketEvents.SUPPLIER_PENDING_COUNT_UPDATE,
      {
        pendingOffersCount,
        timestamp: new Date(),
      },
    );

    return pendingOffersCount;
  }

  static async emitSupplierPendingOffersList(supplierId: string) {
    const io = getIO();
    const offers = await OfferRepository.findPendingOffersBySupplier(supplierId);

    const enriched = await Promise.all(
      offers.map(async (offer) => {
        const order = await prisma.order.findUnique({ where: { id: offer.orderId } });
        return { ...offer, order: order || null };
      }),
    );

    io.to(socketRooms.user(supplierId)).emit(
      socketEvents.SUPPLIER_PENDING_OFFERS_LIST,
      {
        offers: enriched,
        timestamp: new Date(),
      },
    );

    return enriched;
  }

  static async notifyCustomerNewOffer(input: {
    customerId: string;
    orderId: string;
    offerId: string;
    supplierId: string;
    amount: number;
    estimatedDuration?: number | null;
    timeToStart?: Date | string | null;
  }) {
    await publishNotification({
      userId: input.customerId,
      type: OFFER_NOTIFICATION_TYPES.NEW_OFFER,
      title: "New Offer Received",
      message: `You have received a new offer for your order #${input.orderId}.`,
      data: {
        offerId: input.offerId,
        orderId: input.orderId,
        supplierId: input.supplierId,
        amount: input.amount,
        estimatedDuration: input.estimatedDuration ?? null,
        timeToStart: input.timeToStart ?? null,
      },
    });
  }

  static async notifyCustomerOfferUpdated(input: {
    customerId: string;
    orderId: string;
    offerId: string;
    supplierId: string;
    amount: number;
  }) {
    await publishNotification({
      userId: input.customerId,
      type: OFFER_NOTIFICATION_TYPES.OFFER_UPDATED,
      title: "Offer Updated",
      message: `A supplier updated their offer for your order #${input.orderId}.`,
      data: {
        offerId: input.offerId,
        orderId: input.orderId,
        supplierId: input.supplierId,
        amount: input.amount,
      },
    });
  }

  static async notifySupplierOfferAccepted(input: {
    supplierId: string;
    orderId: string;
    offerId: string;
    sessionId?: string | null;
    withdrawnOrderIds: string[];
  }) {
    await publishNotification({
      userId: input.supplierId,
      type: OFFER_NOTIFICATION_TYPES.OFFER_ACCEPTED,
      title: "Offer Accepted",
      message: `Your offer for order #${input.orderId} has been accepted.`,
      data: {
        offerId: input.offerId,
        orderId: input.orderId,
        sessionId: input.sessionId || null,
        withdrawnOffersCount: input.withdrawnOrderIds.length,
        withdrawnOrderIds: input.withdrawnOrderIds,
      },
    });
  }

  static async notifySupplierOfferRejected(input: {
    supplierId: string;
    offerId: string;
    orderId: string;
  }) {
    await publishNotification({
      userId: input.supplierId,
      type: OFFER_NOTIFICATION_TYPES.OFFER_REJECTED,
      title: "Offer Rejected",
      message: `Your offer for order #${input.orderId} has been rejected.`,
      data: {
        offerId: input.offerId,
        orderId: input.orderId,
      },
    });
  }

  static async emitOrderAvailableAgain(orderId: string) {
    const payload = await buildSupplierOrderPayload(orderId);
    if (!payload) return;

    const categoryId = (payload.category as any)?.id;
    const governmentId = (payload.government as any)?.id;
    if (!categoryId || !governmentId) return;

    const io = getIO();
    io.to(socketRooms.supplierOrders(categoryId, governmentId)).emit(
      socketEvents.ORDER_AVAILABLE_AGAIN,
      {
        orderId,
        order: payload,
        timestamp: new Date(),
      },
    );
  }
}