import { Response } from "express";
import Message from "../models/Message.model";
import { getIO } from "../../../shared/config/socket";

export const sendMessage = async (req: any, res: Response) => {
  try {
    const { sessionId, message } = req.body;
    const senderId = req.user.userId;
    const token = req.headers.authorization;

    const sessionResponse = await axios.get(
      `${process.env.SESSION_SERVICE_URL}/api/sessions/${sessionId}`,
      { headers: { Authorization: token } },
    );

    const session = sessionResponse.data;

    if (["completed", "cancelled"].includes(session.status)) {
      return res.status(403).json({
        message: "Chat is closed. Session already completed.",
      });
    }

    if (session.customerId !== senderId && session.supplierId !== senderId) {
      return res.status(403).json({ message: "Not allowed in this chat" });
    }

    const receiverId =
      senderId === session.customerId ? session.supplierId : session.customerId;

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

export const getMessagesBySession = async (req: any, res: Response) => {
  try {
    const { sessionId } = req.params;
    const userId = req.user.userId;
    const token = req.headers.authorization;

    const sessionResponse = await axios.get(
      `${process.env.SESSION_SERVICE_URL}/api/sessions/${sessionId}`,
      { headers: { Authorization: token } }
    );

    const session = sessionResponse.data;

    if (["completed", "cancelled"].includes(session.status)) {
      return res.status(403).json({
        message: "Chat is closed. Session completed.",
      });
    }

    if (
      session.customerId !== userId &&
      session.supplierId !== userId
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
