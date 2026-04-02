import { Server as SocketIOServer, Socket } from "socket.io";
import jwt from "jsonwebtoken";
import CallSessionModel from "../../modules/call/models/call.model";
import JobSessionModel from "../../modules/session/models/session.model";

let io: SocketIOServer;

interface SocketUser {
  userId: string;
  role?: string;
}

export const socketRooms = {
  user: (userId: string) => `user_${userId}`,
  supplierOrders: (categoryId: string, governmentId: string) =>
    `category_${categoryId}_government_${governmentId}`,
  chat: (sessionId: string) => `chat_${sessionId}`,
};

export const socketEvents = {
  JOIN_SUPPLIER_ORDER_ROOMS: "join_supplier_order_rooms",
  LEAVE_SUPPLIER_ORDER_ROOMS: "leave_supplier_order_rooms",

  JOIN_SESSION_ROOM: "join_session_room",
  LEAVE_SESSION_ROOM: "leave_session_room",

  SESSION_ROOM_JOINED: "session_room_joined",
  SUPPLIER_ROOMS_JOINED: "supplier_rooms_joined",

  SESSION_PAYMENT_CONFIRMED: "session:payment_confirmed",

  ORDER_NEW: "order:new",
  ORDER_UPDATED: "order:updated",
  ORDER_DELETED: "order:deleted",
  ORDER_AVAILABLE_AGAIN: "order:available_again",
  ORDER_ACCEPTED_DIRECT: "order:accepted_direct",

  OFFER_NEW: "offer:new",
  OFFER_UPDATED: "offer:updated",
  OFFER_ACCEPTED: "offer:accepted",
  OFFER_REJECTED: "offer:rejected",
  OFFER_DELETED: "offer:deleted",

  SESSION_CREATED: "session:created",
  SESSION_UPDATED: "session:updated",
  SESSION_STATUS_UPDATED: "session:status_updated",
  SESSION_COMPLETED: "session:completed",
  SESSION_CANCELLED: "session:cancelled",

  MESSAGE_NEW: "message:new",
  MESSAGE_READ: "message:read",

  SUPPLIER_OFFER_CREATED: "supplier:offer_created",
  SUPPLIER_OFFER_UPDATED: "supplier:offer_updated",
  SUPPLIER_OFFER_WITHDRAWN: "supplier:offer_withdrawn",
  SUPPLIER_PENDING_COUNT_UPDATE: "supplier:pending_count_update",
  SUPPLIER_PENDING_OFFERS_LIST: "supplier:pending_offers_list",
  SUPPLIER_ACCEPTED_OFFER_WITHDRAWN: "supplier:accepted_offer_withdrawn",

  CALL_START: "call:start",
  CALL_INCOMING: "call:incoming",
  CALL_RINGING: "call:ringing",
  CALL_ACCEPT: "call:accept",
  CALL_ACCEPTED: "call:accepted",
  CALL_DECLINE: "call:decline",
  CALL_DECLINED: "call:declined",
  CALL_END: "call:end",
  CALL_ENDED: "call:ended",
  CALL_MISSED: "call:missed",
  CALL_BUSY: "call:busy",
  CALL_ERROR: "call:error",

  CALL_OFFER: "call:offer",
  CALL_ANSWER: "call:answer",
  CALL_ICE_CANDIDATE: "call:ice_candidate",

  NEW_NOTIFICATION: "new_notification",
  NOTIFICATION_READ: "notification:read",
  NOTIFICATIONS_ALL_READ: "notifications:all_read",

  CREATED: "bundle_booking:created",
  UPDATED: "bundle_booking:updated",
  ACCEPTED: "bundle_booking:accepted",
  REJECTED: "bundle_booking:rejected",
  CANCELLED: "bundle_booking:cancelled",
};

const ACTIVE_CALL_STATUSES = ["initiated", "ringing", "accepted"];

const canAccessSession = async (sessionId: string, userId: string) => {
  const session = await JobSessionModel.findById(sessionId);
  if (!session) {
    return { ok: false, reason: "Session not found" };
  }

  if (["completed", "cancelled"].includes(session.status)) {
    return { ok: false, reason: "Session is not active" };
  }

  const isCustomer = session.customerId.toString() === userId;
  const isSupplier = session.supplierId.toString() === userId;

  if (!isCustomer && !isSupplier) {
    return { ok: false, reason: "Not allowed in this session" };
  }

  return { ok: true, session };
};

export const initSocket = (server: any) => {
  io = new SocketIOServer(server, {
    cors: {
      origin: process.env.CLIENT_URL || "https://be-instantly-app.onrender.com",
      methods: ["GET", "POST", "PUT", "DELETE"],
    },
  });

  io.use((socket: Socket, next) => {
    try {
      const token = socket.handshake.auth?.token;

      if (!token) {
        return next(new Error("Unauthorized"));
      }

      const decoded = jwt.verify(
        token,
        process.env.JWT_SECRET as string,
      ) as SocketUser;

      socket.data.user = decoded;
      next();
    } catch (error) {
      next(new Error("Unauthorized"));
    }
  });

  io.on("connection", (socket) => {
    const user = socket.data.user as SocketUser | undefined;

    console.log("Socket connected:", socket.id, user?.userId);

    if (user?.userId) {
      socket.join(socketRooms.user(user.userId));
    }

    socket.on(
      socketEvents.JOIN_SESSION_ROOM,
      ({ sessionId }: { sessionId: string }) => {
        if (!sessionId) return;

        const room = socketRooms.chat(sessionId);
        socket.join(room);

        console.log(`Socket ${socket.id} joined session room ${room}`);

        socket.emit(socketEvents.SESSION_ROOM_JOINED, { sessionId });
      },
    );

    socket.on(
      socketEvents.LEAVE_SESSION_ROOM,
      ({ sessionId }: { sessionId: string }) => {
        if (!sessionId) return;

        const room = socketRooms.chat(sessionId);
        socket.leave(room);

        console.log(`Socket ${socket.id} left session room ${room}`);
      },
    );

    socket.on(
      socketEvents.JOIN_SUPPLIER_ORDER_ROOMS,
      ({
        categoryId,
        governmentIds,
      }: {
        categoryId: string;
        governmentIds: string[];
      }) => {
        if (user?.role !== "supplier") return;
        if (!categoryId || !Array.isArray(governmentIds)) return;

        for (const governmentId of governmentIds) {
          const room = socketRooms.supplierOrders(categoryId, governmentId);
          socket.join(room);
          console.log(`Socket ${socket.id} joined ${room}`);
        }

        socket.emit(socketEvents.SUPPLIER_ROOMS_JOINED, {
          categoryId,
          governmentIds,
        });
      },
    );

    socket.on(
      socketEvents.LEAVE_SUPPLIER_ORDER_ROOMS,
      ({
        categoryId,
        governmentIds,
      }: {
        categoryId: string;
        governmentIds: string[];
      }) => {
        if (!categoryId || !Array.isArray(governmentIds)) return;

        for (const governmentId of governmentIds) {
          const room = socketRooms.supplierOrders(categoryId, governmentId);
          socket.leave(room);
          console.log(`Socket ${socket.id} left ${room}`);
        }
      },
    );

    socket.on(
      socketEvents.CALL_START,
      async ({ sessionId }: { sessionId: string }) => {
        try {
          if (!user?.userId || !sessionId) return;

          const validation = await canAccessSession(sessionId, user.userId);
          if (!validation.ok || !validation.session) {
            socket.emit(socketEvents.CALL_ERROR, {
              sessionId,
              message: validation.reason || "Call not allowed",
            });
            return;
          }

          const session = validation.session;

          const receiverId =
            session.customerId.toString() === user.userId
              ? session.supplierId.toString()
              : session.customerId.toString();

          const existingActiveCall = await CallSessionModel.findOne({
            sessionId,
            status: { $in: ACTIVE_CALL_STATUSES },
          });

          if (existingActiveCall) {
            socket.emit(socketEvents.CALL_BUSY, {
              sessionId,
              callId: existingActiveCall._id.toString(),
              message: "There is already an active call",
            });
            return;
          }

          const call = await CallSessionModel.create({
            sessionId,
            callerId: user.userId,
            receiverId,
            type: "audio",
            status: "ringing",
            startedAt: new Date(),
          });

          io.to(socketRooms.user(receiverId)).emit(socketEvents.CALL_INCOMING, {
            callId: call._id.toString(),
            sessionId,
            callerId: user.userId,
            receiverId,
            type: "audio",
            timestamp: new Date(),
          });

          io.to(socketRooms.user(user.userId)).emit(socketEvents.CALL_RINGING, {
            callId: call._id.toString(),
            sessionId,
            receiverId,
            type: "audio",
            timestamp: new Date(),
          });
        } catch (error) {
          console.error("Socket call:start error:", error);
          socket.emit(socketEvents.CALL_ERROR, {
            sessionId,
            message: "Failed to start call",
          });
        }
      },
    );

    socket.on(
      socketEvents.CALL_ACCEPT,
      async ({ callId, sessionId }: { callId: string; sessionId: string }) => {
        try {
          if (!user?.userId || !callId || !sessionId) return;

          const call = await CallSessionModel.findById(callId);
          if (!call) {
            socket.emit(socketEvents.CALL_ERROR, {
              sessionId,
              callId,
              message: "Call not found",
            });
            return;
          }

          if (call.receiverId.toString() !== user.userId) {
            socket.emit(socketEvents.CALL_ERROR, {
              sessionId,
              callId,
              message: "Only receiver can accept the call",
            });
            return;
          }

          if (!["initiated", "ringing"].includes(call.status)) {
            socket.emit(socketEvents.CALL_ERROR, {
              sessionId,
              callId,
              message: "Call can no longer be accepted",
            });
            return;
          }

          call.status = "accepted";
          call.answeredAt = new Date();
          await call.save();

          io.to(socketRooms.user(call.callerId.toString())).emit(
            socketEvents.CALL_ACCEPTED,
            {
              callId,
              sessionId,
              answeredBy: user.userId,
              timestamp: new Date(),
            },
          );

          io.to(socketRooms.user(call.receiverId.toString())).emit(
            socketEvents.CALL_ACCEPTED,
            {
              callId,
              sessionId,
              answeredBy: user.userId,
              timestamp: new Date(),
            },
          );
        } catch (error) {
          console.error("Socket call:accept error:", error);
          socket.emit(socketEvents.CALL_ERROR, {
            sessionId,
            callId,
            message: "Failed to accept call",
          });
        }
      },
    );

    socket.on(
      socketEvents.CALL_DECLINE,
      async ({ callId, sessionId }: { callId: string; sessionId: string }) => {
        try {
          if (!user?.userId || !callId || !sessionId) return;

          const call = await CallSessionModel.findById(callId);
          if (!call) {
            socket.emit(socketEvents.CALL_ERROR, {
              sessionId,
              callId,
              message: "Call not found",
            });
            return;
          }

          if (call.receiverId.toString() !== user.userId) {
            socket.emit(socketEvents.CALL_ERROR, {
              sessionId,
              callId,
              message: "Only receiver can decline the call",
            });
            return;
          }

          if (!["initiated", "ringing"].includes(call.status)) {
            socket.emit(socketEvents.CALL_ERROR, {
              sessionId,
              callId,
              message: "Call can no longer be declined",
            });
            return;
          }

          call.status = "declined";
          call.endedAt = new Date();
          call.endReason = "declined";
          await call.save();

          io.to(socketRooms.user(call.callerId.toString())).emit(
            socketEvents.CALL_DECLINED,
            {
              callId,
              sessionId,
              declinedBy: user.userId,
              timestamp: new Date(),
            },
          );

          io.to(socketRooms.user(call.receiverId.toString())).emit(
            socketEvents.CALL_DECLINED,
            {
              callId,
              sessionId,
              declinedBy: user.userId,
              timestamp: new Date(),
            },
          );
        } catch (error) {
          console.error("Socket call:decline error:", error);
          socket.emit(socketEvents.CALL_ERROR, {
            sessionId,
            callId,
            message: "Failed to decline call",
          });
        }
      },
    );

    socket.on(
      socketEvents.CALL_END,
      async ({ callId, sessionId }: { callId: string; sessionId: string }) => {
        try {
          if (!user?.userId || !callId || !sessionId) return;

          const call = await CallSessionModel.findById(callId);
          if (!call) {
            socket.emit(socketEvents.CALL_ERROR, {
              sessionId,
              callId,
              message: "Call not found",
            });
            return;
          }

          const isCaller = call.callerId.toString() === user.userId;
          const isReceiver = call.receiverId.toString() === user.userId;

          if (!isCaller && !isReceiver) {
            socket.emit(socketEvents.CALL_ERROR, {
              sessionId,
              callId,
              message: "Not allowed to end this call",
            });
            return;
          }

          if (["ended", "declined", "missed", "failed"].includes(call.status)) {
            return;
          }

          call.status = "ended";
          call.endedAt = new Date();
          call.endReason = isCaller ? "caller_ended" : "receiver_ended";
          await call.save();

          io.to(socketRooms.user(call.callerId.toString())).emit(
            socketEvents.CALL_ENDED,
            {
              callId,
              sessionId,
              endedBy: user.userId,
              timestamp: new Date(),
            },
          );

          io.to(socketRooms.user(call.receiverId.toString())).emit(
            socketEvents.CALL_ENDED,
            {
              callId,
              sessionId,
              endedBy: user.userId,
              timestamp: new Date(),
            },
          );
        } catch (error) {
          console.error("Socket call:end error:", error);
          socket.emit(socketEvents.CALL_ERROR, {
            sessionId,
            callId,
            message: "Failed to end call",
          });
        }
      },
    );

    socket.on(
      socketEvents.CALL_OFFER,
      async ({
        callId,
        sessionId,
        sdp,
      }: {
        callId: string;
        sessionId: string;
        sdp: any;
      }) => {
        try {
          if (!user?.userId || !callId || !sessionId || !sdp) return;

          const call = await CallSessionModel.findById(callId);
          if (!call) {
            socket.emit(socketEvents.CALL_ERROR, {
              sessionId,
              callId,
              message: "Call not found",
            });
            return;
          }

          const isCaller = call.callerId.toString() === user.userId;
          const isReceiver = call.receiverId.toString() === user.userId;

          if (!isCaller && !isReceiver) {
            socket.emit(socketEvents.CALL_ERROR, {
              sessionId,
              callId,
              message: "Not allowed",
            });
            return;
          }

          const targetUserId = isCaller
            ? call.receiverId.toString()
            : call.callerId.toString();

          io.to(socketRooms.user(targetUserId)).emit(socketEvents.CALL_OFFER, {
            callId,
            sessionId,
            fromUserId: user.userId,
            sdp,
          });
        } catch (error) {
          console.error("Socket call:offer error:", error);
          socket.emit(socketEvents.CALL_ERROR, {
            sessionId,
            callId,
            message: "Failed to send offer",
          });
        }
      },
    );

    socket.on(
      socketEvents.CALL_ANSWER,
      async ({
        callId,
        sessionId,
        sdp,
      }: {
        callId: string;
        sessionId: string;
        sdp: any;
      }) => {
        try {
          if (!user?.userId || !callId || !sessionId || !sdp) return;

          const call = await CallSessionModel.findById(callId);
          if (!call) {
            socket.emit(socketEvents.CALL_ERROR, {
              sessionId,
              callId,
              message: "Call not found",
            });
            return;
          }

          const isCaller = call.callerId.toString() === user.userId;
          const isReceiver = call.receiverId.toString() === user.userId;

          if (!isCaller && !isReceiver) {
            socket.emit(socketEvents.CALL_ERROR, {
              sessionId,
              callId,
              message: "Not allowed",
            });
            return;
          }

          const targetUserId = isCaller
            ? call.receiverId.toString()
            : call.callerId.toString();

          io.to(socketRooms.user(targetUserId)).emit(socketEvents.CALL_ANSWER, {
            callId,
            sessionId,
            fromUserId: user.userId,
            sdp,
          });
        } catch (error) {
          console.error("Socket call:answer error:", error);
          socket.emit(socketEvents.CALL_ERROR, {
            sessionId,
            callId,
            message: "Failed to send answer",
          });
        }
      },
    );

    socket.on(
      socketEvents.CALL_ICE_CANDIDATE,
      async ({
        callId,
        sessionId,
        candidate,
      }: {
        callId: string;
        sessionId: string;
        candidate: any;
      }) => {
        try {
          if (!user?.userId || !callId || !sessionId || !candidate) return;

          const call = await CallSessionModel.findById(callId);
          if (!call) {
            socket.emit(socketEvents.CALL_ERROR, {
              sessionId,
              callId,
              message: "Call not found",
            });
            return;
          }

          const isCaller = call.callerId.toString() === user.userId;
          const isReceiver = call.receiverId.toString() === user.userId;

          if (!isCaller && !isReceiver) {
            socket.emit(socketEvents.CALL_ERROR, {
              sessionId,
              callId,
              message: "Not allowed",
            });
            return;
          }

          const targetUserId = isCaller
            ? call.receiverId.toString()
            : call.callerId.toString();

          io.to(socketRooms.user(targetUserId)).emit(
            socketEvents.CALL_ICE_CANDIDATE,
            {
              callId,
              sessionId,
              fromUserId: user.userId,
              candidate,
            },
          );
        } catch (error) {
          console.error("Socket call:ice_candidate error:", error);
          socket.emit(socketEvents.CALL_ERROR, {
            sessionId,
            callId,
            message: "Failed to relay ICE candidate",
          });
        }
      },
    );

    socket.on("disconnect", (reason) => {
      console.log("Socket disconnected:", socket.id, reason);
    });
  });

  return io;
};

export const getIO = () => {
  if (!io) {
    throw new Error("Socket.io not initialized!");
  }
  return io;
};
