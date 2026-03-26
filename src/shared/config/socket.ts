import { Server as SocketIOServer, Socket } from "socket.io";
import jwt from "jsonwebtoken";

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

  SUPPLIER_OFFER_CREATED: "supplier:offer_created",
  SUPPLIER_OFFER_UPDATED: "supplier:offer_updated",
  SUPPLIER_OFFER_WITHDRAWN: "supplier:offer_withdrawn",
  SUPPLIER_PENDING_COUNT_UPDATE: "supplier:pending_count_update",
  SUPPLIER_PENDING_OFFERS_LIST: "supplier:pending_offers_list",
  SUPPLIER_ACCEPTED_OFFER_WITHDRAWN: "supplier:accepted_offer_withdrawn",
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

        socket.emit("supplier_rooms_joined", {
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
