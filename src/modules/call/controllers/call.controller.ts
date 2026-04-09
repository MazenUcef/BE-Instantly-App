import { Response } from "express";
import { CallService } from "../services/call.service";

export const startCall = async (req: any, res: Response) => {
  const result = await CallService.startCall({
    sessionId: req.body.sessionId,
    callerId: req.user.userId,
    type: req.body.type || "audio",
  });

  return res.status(201).json(result);
};

export const acceptCall = async (req: any, res: Response) => {
  const result = await CallService.acceptCall({
    callId: req.params.id,
    userId: req.user.userId,
  });

  return res.status(200).json(result);
};

export const declineCall = async (req: any, res: Response) => {
  const result = await CallService.declineCall({
    callId: req.params.id,
    userId: req.user.userId,
  });

  return res.status(200).json(result);
};

export const endCall = async (req: any, res: Response) => {
  const result = await CallService.endCall({
    callId: req.params.id,
    userId: req.user.userId,
  });

  return res.status(200).json(result);
};

export const markMissedCall = async (req: any, res: Response) => {
  const result = await CallService.markMissedCall({
    callId: req.params.id,
    userId: req.user.userId,
  });

  return res.status(200).json(result);
};

export const getSessionCallHistory = async (req: any, res: Response) => {
  const result = await CallService.getSessionCallHistory({
    sessionId: req.params.sessionId,
    userId: req.user.userId,
  });

  return res.status(200).json(result);
};

export const getIceConfig = async (_req: any, res: Response) => {
  const result = await CallService.getIceConfig();

  return res.status(200).json(result);
};