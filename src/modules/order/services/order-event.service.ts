import { getIO, socketEvents, socketRooms } from "../../../shared/config/socket";
import { publishNotification } from "../../notification/notification.publisher";
import { buildSupplierOrderPayload } from "../../../shared/utils/buildSupplierOrderPayload";

export class OrderEventService {
  static async emitOrderCreated(orderId: string, categoryId: string, governmentId: string) {
    const payload = await buildSupplierOrderPayload(orderId);

    if (!payload) {
      throw new Error("Failed to build order payload");
    }

    const io = getIO();
    io.to(socketRooms.supplierOrders(categoryId, governmentId)).emit(
      socketEvents.ORDER_NEW,
      payload,
    );

    return payload;
  }

  static async emitOrderUpdated(orderId: string, categoryId: string, governmentId: string) {
    const payload = await buildSupplierOrderPayload(orderId);

    if (!payload) {
      throw new Error("Failed to build order payload");
    }

    const io = getIO();
    io.to(socketRooms.supplierOrders(categoryId, governmentId)).emit(
      socketEvents.ORDER_UPDATED,
      payload,
    );

    return payload;
  }

  static async emitOrderDeleted(orderId: string, categoryId: string, governmentId: string) {
    const io = getIO();

    io.to(socketRooms.supplierOrders(categoryId, governmentId)).emit(
      socketEvents.ORDER_DELETED,
      { orderId },
    );
  }

  static async notifySuppliersOrderDeleted(pendingOffers: any[], orderId: string) {
    const io = getIO();

    for (const offer of pendingOffers) {
      io.to(socketRooms.user(offer.supplierId.toString())).emit(
        socketEvents.OFFER_REJECTED,
        {
          offerId: offer._id.toString(),
          orderId,
          reason: "order_deleted_by_customer",
          timestamp: new Date(),
        },
      );

      await publishNotification({
        userId: offer.supplierId.toString(),
        type: "OFFER_REJECTED",
        title: "Offer Rejected",
        message: `Your offer for order #${orderId} was rejected because the customer deleted the order.`,
        data: {
          offerId: offer._id.toString(),
          orderId,
        },
      });
    }
  }
}