import {
  getIO,
  socketEvents,
  socketRooms,
} from "../../../shared/config/socket";
import { publishNotification } from "../../notification/notification.publisher";
import { buildSupplierOrderPayload } from "../../../shared/utils/buildSupplierOrderPayload";

export class OrderEventService {
  private static buildEnvelope(input: {
    type: string;
    orderId: string;
    order?: any;
    actorId?: string;
    actorRole?: "customer" | "supplier" | "system" | "admin";
    reason?: string | null;
  }) {
    return {
      type: input.type,
      orderId: input.orderId,
      order: input.order ?? null,
      meta: {
        actorId: input.actorId || null,
        actorRole: input.actorRole || null,
        reason: input.reason || null,
        changedAt: new Date().toISOString(),
      },
    };
  }

  static async emitOrderCreated(
    orderId: string,
    categoryId: string,
    governmentId: string,
  ) {
    const order = await buildSupplierOrderPayload(orderId);

    if (!order) {
      throw new Error("Failed to build order payload");
    }

    const payload = this.buildEnvelope({
      type: "order.created",
      orderId,
      order,
    });

    const io = getIO();
    io.to(socketRooms.supplierOrders(categoryId, governmentId)).emit(
      socketEvents.ORDER_NEW,
      payload,
    );

    return order;
  }

  static async emitOrderUpdated(
    orderId: string,
    categoryId: string,
    governmentId: string,
  ) {
    const order = await buildSupplierOrderPayload(orderId);

    if (!order) {
      throw new Error("Failed to build order payload");
    }

    const payload = this.buildEnvelope({
      type: "order.updated",
      orderId,
      order,
    });

    const io = getIO();
    io.to(socketRooms.supplierOrders(categoryId, governmentId)).emit(
      socketEvents.ORDER_UPDATED,
      payload,
    );

    return order;
  }

  static async emitOrderCancelled(
    orderId: string,
    categoryId: string,
    governmentId: string,
    meta?: {
      actorId?: string;
      actorRole?: "customer" | "supplier" | "system" | "admin";
      reason?: string | null;
    },
  ) {
    const payload = this.buildEnvelope({
      type: "order.cancelled",
      orderId,
      actorId: meta?.actorId,
      actorRole: meta?.actorRole,
      reason: meta?.reason,
    });

    const io = getIO();
    io.to(socketRooms.supplierOrders(categoryId, governmentId)).emit(
      socketEvents.ORDER_CANCELLED,
      payload,
    );
  }

  static async emitOrderAvailableAgain(
    orderId: string,
    categoryId: string,
    governmentId: string,
    reason?: string,
  ) {
    const order = await buildSupplierOrderPayload(orderId);
    if (!order) return null;

    const payload = this.buildEnvelope({
      type: "order.available_again",
      orderId,
      order,
      reason: reason || null,
    });

    const io = getIO();
    io.to(socketRooms.supplierOrders(categoryId, governmentId)).emit(
      socketEvents.ORDER_AVAILABLE_AGAIN,
      payload,
    );

    return order;
  }

  static async notifySuppliersOrderCancelled(
    pendingOffers: any[],
    orderId: string,
    reason = "order_cancelled_by_customer",
  ) {
    const io = getIO();

    for (const offer of pendingOffers) {
      io.to(socketRooms.user(offer.supplierId.toString())).emit(
        socketEvents.OFFER_REJECTED,
        {
          type: "offer.rejected",
          offerId: offer._id.toString(),
          orderId,
          meta: {
            reason,
            changedAt: new Date().toISOString(),
          },
        },
      );

      await publishNotification({
        userId: offer.supplierId.toString(),
        type: "OFFER_REJECTED",
        title: "Offer Rejected",
        message: `Your offer for order #${orderId} was rejected because the order was cancelled.`,
        data: {
          offerId: offer._id.toString(),
          orderId,
          reason,
        },
      });
    }
  }
}
