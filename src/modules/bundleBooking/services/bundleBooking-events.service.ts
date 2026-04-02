import { getIO, socketEvents, socketRooms } from "../../../shared/config/socket";
import { BUNDLE_BOOKING_NOTIFICATION_TYPES } from "../../../shared/constants/bundleBooking.constants";
import { publishNotification } from "../../notification/notification.publisher";


export class BundleBookingEventService {
  static emitToCustomerAndSupplier(eventName: string, booking: any) {
    const io = getIO();

    io.to(socketRooms.user(String(booking.customerId))).emit(eventName, booking);
    io.to(socketRooms.user(String(booking.supplierId))).emit(eventName, booking);
  }

  static emitCreatedToSupplier(booking: any) {
    const io = getIO();

    io.to(socketRooms.user(String(booking.supplierId))).emit(
      socketEvents.CREATED,
      booking,
    );
  }

  static emitAccepted(booking: any) {
    const io = getIO();

    io.to(socketRooms.user(String(booking.customerId))).emit(
      socketEvents.ACCEPTED,
      booking,
    );

    io.to(socketRooms.user(String(booking.supplierId))).emit(
      socketEvents.UPDATED,
      booking,
    );
  }

  static emitRejected(booking: any) {
    const io = getIO();

    io.to(socketRooms.user(String(booking.customerId))).emit(
      socketEvents.REJECTED,
      booking,
    );

    io.to(socketRooms.user(String(booking.supplierId))).emit(
      socketEvents.UPDATED,
      booking,
    );
  }

  static emitUpdated(booking: any) {
    this.emitToCustomerAndSupplier(socketEvents.UPDATED, booking);
  }

  static emitCancelled(booking: any) {
    this.emitToCustomerAndSupplier(socketEvents.CANCELLED, booking);
  }

  static async notifyCreated(booking: any, bundleTitle?: string) {
    await publishNotification({
      userId: String(booking.supplierId),
      type: BUNDLE_BOOKING_NOTIFICATION_TYPES.CREATED,
      title: "New Bundle Booking Request",
      message: `You received a new booking request${bundleTitle ? ` for "${bundleTitle}"` : ""}.`,
      data: {
        bookingId: String(booking._id),
        bundleId: String(booking.bundleId),
        customerId: String(booking.customerId),
      },
    });
  }

  static async notifyAccepted(booking: any) {
    await publishNotification({
      userId: String(booking.customerId),
      type: BUNDLE_BOOKING_NOTIFICATION_TYPES.ACCEPTED,
      title: "Booking Accepted",
      message: "Your bundle booking has been accepted by the supplier.",
      data: {
        bookingId: String(booking._id),
        bundleId: String(booking.bundleId),
      },
    });
  }

  static async notifyRejected(booking: any) {
    await publishNotification({
      userId: String(booking.customerId),
      type: BUNDLE_BOOKING_NOTIFICATION_TYPES.REJECTED,
      title: "Booking Rejected",
      message: "Your bundle booking was rejected by the supplier.",
      data: {
        bookingId: String(booking._id),
        bundleId: String(booking.bundleId),
        rejectionReason: booking.rejectionReason || null,
      },
    });
  }

  static async notifyDone(booking: any) {
    await publishNotification({
      userId: String(booking.customerId),
      type: BUNDLE_BOOKING_NOTIFICATION_TYPES.DONE,
      title: "Service Finished",
      message: "The supplier marked your service as done.",
      data: {
        bookingId: String(booking._id),
      },
    });
  }

  static async notifyCompleted(booking: any) {
    await publishNotification({
      userId: String(booking.customerId),
      type: BUNDLE_BOOKING_NOTIFICATION_TYPES.COMPLETED,
      title: "Booking Completed",
      message: "Your bundle booking has been completed successfully.",
      data: {
        bookingId: String(booking._id),
      },
    });
  }

  static async notifyCancelled(booking: any, cancelledBy: "customer" | "supplier") {
    await publishNotification({
      userId:
        cancelledBy === "customer"
          ? String(booking.supplierId)
          : String(booking.customerId),
      type: BUNDLE_BOOKING_NOTIFICATION_TYPES.CANCELLED,
      title: "Booking Cancelled",
      message:
        cancelledBy === "customer"
          ? "The customer cancelled the booking."
          : "The supplier cancelled the booking.",
      data: {
        bookingId: String(booking._id),
        cancelledBy,
      },
    });
  }
}