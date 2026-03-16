import { Response, Request } from "express";
import Message from "../models/Message.model";
import { getIO } from "../../../shared/config/socket";
import JobSession from "../../session/models/session.model";

export const sendMessage = async (req: Request, res: Response) => {
  try {
    const { sessionId, message } = req.body;
    const senderId = (req as any).user.userId;

    const session = await JobSession.findById(sessionId);

    if (!session) {
      return res.status(404).json({ message: "Session not found" });
    }

    if (["completed", "cancelled"].includes(session.status)) {
      return res.status(403).json({
        message: "Chat is closed. Session already completed.",
      });
    }

    if (
      session.customerId.toString() !== senderId &&
      session.supplierId.toString() !== senderId
    ) {
      return res.status(403).json({ message: "Not allowed in this chat" });
    }

    const receiverId =
      senderId === session.customerId.toString()
        ? session.supplierId.toString()
        : session.customerId.toString();

    const newMessage = await Message.create({
      sessionId,
      senderId,
      receiverId,
      message,
    });

    const io = getIO();
    io.to(`chat_${sessionId}`).emit("receive_message", newMessage);

    res.status(201).json(newMessage);
  } catch (error) {
    console.error("Send message error:", error);
    res.status(500).json({ message: "Failed to send message" });
  }
};

export const getMessagesBySession = async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;
    const userId = (req as any).user.userId;

    const session = await JobSession.findById(sessionId);

    if (!session) {
      return res.status(404).json({ message: "Session not found" });
    }

    if (["completed", "cancelled"].includes(session.status)) {
      return res.status(403).json({
        message: "Chat is closed. Session completed.",
      });
    }

    if (
      session.customerId.toString() !== userId &&
      session.supplierId.toString() !== userId
    ) {
      return res.status(403).json({ message: "Not allowed" });
    }

    const messages = await Message.find({ sessionId }).sort({
      createdAt: 1,
    });

    res.json({ count: messages.length, messages });
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch messages" });
  }
};
