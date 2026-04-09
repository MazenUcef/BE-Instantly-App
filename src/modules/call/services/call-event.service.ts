import { getIO, socketRooms } from "../../../shared/config/socket";
import { publishNotification } from "../../notification/notification.publisher";
import {
  CALL_NOTIFICATION_TYPES,
  CALL_SOCKET_EVENTS,
} from "../../../shared/constants/call.constants";

export class CallEventService {
  static emitIncoming(call: any) {
    const io = getIO();

    io.to(socketRooms.user(String(call.receiverId))).emit(
      CALL_SOCKET_EVENTS.INCOMING,
      {
        callId: String(call._id),
        sessionId: String(call.sessionId),
        callerId: String(call.callerId),
        receiverId: String(call.receiverId),
        call,
        timestamp: new Date(),
      },
    );
  }

  static emitRinging(call: any) {
    const io = getIO();

    io.to(socketRooms.user(String(call.callerId))).emit(
      CALL_SOCKET_EVENTS.RINGING,
      {
        callId: String(call._id),
        sessionId: String(call.sessionId),
        receiverId: String(call.receiverId),
        call,
        timestamp: new Date(),
      },
    );
  }

  static emitAccepted(call: any) {
    const io = getIO();

    io.to(socketRooms.user(String(call.callerId))).emit(
      CALL_SOCKET_EVENTS.ACCEPTED,
      {
        callId: String(call._id),
        sessionId: String(call.sessionId),
        call,
        timestamp: new Date(),
      },
    );

    io.to(socketRooms.user(String(call.receiverId))).emit(
      CALL_SOCKET_EVENTS.ACCEPTED,
      {
        callId: String(call._id),
        sessionId: String(call.sessionId),
        call,
        timestamp: new Date(),
      },
    );
  }

  static emitDeclined(call: any) {
    const io = getIO();

    io.to(socketRooms.user(String(call.callerId))).emit(
      CALL_SOCKET_EVENTS.DECLINED,
      {
        callId: String(call._id),
        sessionId: String(call.sessionId),
        call,
        timestamp: new Date(),
      },
    );

    io.to(socketRooms.user(String(call.receiverId))).emit(
      CALL_SOCKET_EVENTS.DECLINED,
      {
        callId: String(call._id),
        sessionId: String(call.sessionId),
        call,
        timestamp: new Date(),
      },
    );
  }

  static emitEnded(call: any, endedBy: string) {
    const io = getIO();

    io.to(socketRooms.user(String(call.callerId))).emit(
      CALL_SOCKET_EVENTS.ENDED,
      {
        callId: String(call._id),
        sessionId: String(call.sessionId),
        call,
        endedBy,
        timestamp: new Date(),
      },
    );

    io.to(socketRooms.user(String(call.receiverId))).emit(
      CALL_SOCKET_EVENTS.ENDED,
      {
        callId: String(call._id),
        sessionId: String(call.sessionId),
        call,
        endedBy,
        timestamp: new Date(),
      },
    );
  }

  static emitMissed(call: any) {
    const io = getIO();

    io.to(socketRooms.user(String(call.callerId))).emit(
      CALL_SOCKET_EVENTS.MISSED,
      {
        callId: String(call._id),
        sessionId: String(call.sessionId),
        call,
        timestamp: new Date(),
      },
    );

    io.to(socketRooms.user(String(call.receiverId))).emit(
      CALL_SOCKET_EVENTS.MISSED,
      {
        callId: String(call._id),
        sessionId: String(call.sessionId),
        call,
        timestamp: new Date(),
      },
    );
  }

  static async notifyIncoming(call: any) {
    const callType = call.type === "video" ? "video" : "audio";
    await publishNotification({
      userId: String(call.receiverId),
      type: CALL_NOTIFICATION_TYPES.INCOMING_CALL,
      title: `Incoming ${callType} call`,
      message: `You have an incoming ${callType} call in an active session.`,
      data: {
        callId: String(call._id),
        sessionId: String(call.sessionId),
        callerId: String(call.callerId),
        callType,
      },
    });
  }

  static async notifyDeclined(call: any) {
    await publishNotification({
      userId: String(call.callerId),
      type: CALL_NOTIFICATION_TYPES.CALL_DECLINED,
      title: "Call declined",
      message: "Your call was declined.",
      data: {
        callId: String(call._id),
        sessionId: String(call.sessionId),
      },
    });
  }

  static async notifyMissed(call: any) {
    await publishNotification({
      userId: String(call.callerId),
      type: CALL_NOTIFICATION_TYPES.MISSED_CALL,
      title: "Missed call",
      message: "Your call was missed.",
      data: {
        callId: String(call._id),
        sessionId: String(call.sessionId),
      },
    });
  }
}