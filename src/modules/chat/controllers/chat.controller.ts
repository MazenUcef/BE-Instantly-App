import { Request, Response } from "express";
import { ChatService } from "../services/chat.service";

export const sendMessage = async (req: any, res: Response) => {
  const result = await ChatService.sendMessage({
    senderId: req.user.userId,
    sessionId: req.body.sessionId,
    message: req.body.message,
  });

  return res.status(201).json(result);
};

export const getMessagesBySession = async (req: any, res: Response) => {
  const result = await ChatService.getMessagesBySession({
    userId: req.user.userId,
    sessionId: req.params.sessionId,
    page: Number(req.query.page || 1),
    limit: Number(req.query.limit || 50),
  });

  return res.status(200).json(result);
};

export const markMessagesAsRead = async (req: any, res: Response) => {
  const result = await ChatService.markMessagesAsRead({
    userId: req.user.userId,
    sessionId: req.params.sessionId,
  });

  return res.status(200).json(result);
};