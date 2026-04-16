import {
  getIO,
  socketEvents,
  socketRooms,
} from "../../../shared/config/socket";
import { publishNotification } from "../../notification/notification.publisher";
import { buildSupplierOrderPayload } from "../../../shared/utils/buildSupplierOrderPayload";
import { UserRepository } from "../../auth/repositories/user.repository";
import { ORDER_NOTIFICATION_TYPES } from "../../../shared/constants/order.constants";

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
    customerId?: string,
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

    const supplierIds = await UserRepository.findSupplierIdsByCategoryAndGovernment(
      categoryId,
      governmentId,
      customerId,
    );
    await Promise.all(
      supplierIds.map((supplierId) =>
        publishNotification({
          userId: supplierId,
          type: ORDER_NOTIFICATION_TYPES.ORDER_CREATED,
          title: "New Order Available",
          message: `A new order is available in your area.`,
          data: { orderId, categoryId, governmentId },
        }),
      ),
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

    const supplierIds = await UserRepository.findSupplierIdsByCategoryAndGovernment(
      categoryId,
      governmentId,
    );
    await Promise.all(
      supplierIds.map((supplierId) =>
        publishNotification({
          userId: supplierId,
          type: ORDER_NOTIFICATION_TYPES.ORDER_PRICE_UPDATED,
          title: "Order Price Updated",
          message: `An order in your area has been updated with a new price.`,
          data: { orderId, categoryId, governmentId },
        }),
      ),
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
      io.to(socketRooms.user(offer.supplierId)).emit(
        socketEvents.OFFER_REJECTED,
        {
          type: "offer.rejected",
          offerId: offer.id,
          orderId,
          meta: {
            reason,
            changedAt: new Date().toISOString(),
          },
        },
      );

      await publishNotification({
        userId: offer.supplierId,
        type: ORDER_NOTIFICATION_TYPES.OFFER_REJECTED,
        title: "Offer Rejected",
        message: `Your offer for order #${orderId} was rejected because the order was cancelled.`,
        data: {
          offerId: offer.id,
          orderId,
          reason,
        },
      });
    }
  }
}
