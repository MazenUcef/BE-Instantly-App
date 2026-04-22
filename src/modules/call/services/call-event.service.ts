import { getIO, socketRooms } from "../../../shared/config/socket";
import { publishNotification } from "../../notification/notification.publisher";
import {
  CALL_NOTIFICATION_TYPES,
  CALL_SOCKET_EVENTS,
} from "../../../shared/constants/call.constants";

export class CallEventService {
  static emitIncoming(call: any) {
    const io = getIO();

    io.to(socketRooms.user(call.receiverId)).emit(
      CALL_SOCKET_EVENTS.INCOMING,
      {
        callId: call.id,
        sessionId: call.sessionId,
        callerId: call.callerId,
        receiverId: call.receiverId,
        call,
        timestamp: new Date(),
      },
    );
  }

  static emitRinging(call: any) {
    const io = getIO();

    io.to(socketRooms.user(call.callerId)).emit(
      CALL_SOCKET_EVENTS.RINGING,
      {
        callId: call.id,
        sessionId: call.sessionId,
        receiverId: call.receiverId,
        call,
        timestamp: new Date(),
      },
    );
  }

  static emitAccepted(call: any) {
    const io = getIO();

    io.to(socketRooms.user(call.callerId)).emit(
      CALL_SOCKET_EVENTS.ACCEPTED,
      {
        callId: call.id,
        sessionId: call.sessionId,
        call,
        timestamp: new Date(),
      },
    );

    io.to(socketRooms.user(call.receiverId)).emit(
      CALL_SOCKET_EVENTS.ACCEPTED,
      {
        callId: call.id,
        sessionId: call.sessionId,
        call,
        timestamp: new Date(),
      },
    );
  }

  static emitDeclined(call: any) {
    const io = getIO();

    io.to(socketRooms.user(call.callerId)).emit(
      CALL_SOCKET_EVENTS.DECLINED,
      {
        callId: call.id,
        sessionId: call.sessionId,
        call,
        timestamp: new Date(),
      },
    );

    io.to(socketRooms.user(call.receiverId)).emit(
      CALL_SOCKET_EVENTS.DECLINED,
      {
        callId: call.id,
        sessionId: call.sessionId,
        call,
        timestamp: new Date(),
      },
    );
  }

  static emitEnded(call: any, endedBy: string) {
    const io = getIO();

    io.to(socketRooms.user(call.callerId)).emit(
      CALL_SOCKET_EVENTS.ENDED,
      {
        callId: call.id,
        sessionId: call.sessionId,
        call,
        endedBy,
        timestamp: new Date(),
      },
    );

    io.to(socketRooms.user(call.receiverId)).emit(
      CALL_SOCKET_EVENTS.ENDED,
      {
        callId: call.id,
        sessionId: call.sessionId,
        call,
        endedBy,
        timestamp: new Date(),
      },
    );
  }

  static emitMissed(call: any) {
    const io = getIO();

    io.to(socketRooms.user(call.callerId)).emit(
      CALL_SOCKET_EVENTS.MISSED,
      {
        callId: call.id,
        sessionId: call.sessionId,
        call,
        timestamp: new Date(),
      },
    );

    io.to(socketRooms.user(call.receiverId)).emit(
      CALL_SOCKET_EVENTS.MISSED,
      {
        callId: call.id,
        sessionId: call.sessionId,
        call,
        timestamp: new Date(),
      },
    );
  }

  static async notifyIncoming(call: any) {
    const callType = call.type === "video" ? "video" : "audio";
    await publishNotification({
      userId: call.receiverId,
      type: CALL_NOTIFICATION_TYPES.INCOMING_CALL,
      title: `Incoming ${callType} call`,
      message: `You have an incoming ${callType} call in an active session.`,
      data: {
        callId: call.id,
        sessionId: call.sessionId,
        callerId: call.callerId,
        callType,
      },
    });
  }

  static async notifyDeclined(call: any) {
    await publishNotification({
      userId: call.callerId,
      type: CALL_NOTIFICATION_TYPES.CALL_DECLINED,
      title: "Call declined",
      message: "Your call was declined.",
      data: {
        callId: call.id,
        sessionId: call.sessionId,
      },
    });
  }

  static async notifyMissed(call: any) {
    await Promise.all([
      publishNotification({
        userId: call.callerId,
        type: CALL_NOTIFICATION_TYPES.MISSED_CALL,
        title: "Missed call",
        message: "Your call was not answered.",
        data: {
          callId: call.id,
          sessionId: call.sessionId,
        },
      }),
      publishNotification({
        userId: call.receiverId,
        type: CALL_NOTIFICATION_TYPES.MISSED_CALL,
        title: "Missed call",
        message: "You missed a call.",
        data: {
          callId: call.id,
          sessionId: call.sessionId,
          callerId: call.callerId,
        },
      }),
    ]);
  }
}