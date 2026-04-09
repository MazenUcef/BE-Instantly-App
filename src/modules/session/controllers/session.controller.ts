import { Response } from "express";
import { SessionService } from "../services/session.service";

export const createSession = async (req: any, res: Response) => {
  const result = await SessionService.createSession({
    orderId: req.body.orderId,
    offerId: req.body.offerId,
    customerId: req.body.customerId,
    supplierId: req.body.supplierId,
  });

  return res.status(201).json(result);
};

export const getSessionById = async (req: any, res: Response) => {
  const result = await SessionService.getSessionById({
    sessionId: req.params.id,
    userId: req.user.userId,
  });

  return res.status(200).json(result);
};

export const getActiveSessionForUser = async (req: any, res: Response) => {
  const result = await SessionService.getActiveSessionForUser({
    requestedUserId: req.params.userId,
    actorUserId: req.user.userId,
  });

  return res.status(200).json(result);
};

export const updateSessionStatus = async (req: any, res: Response) => {
  const result = await SessionService.updateSessionStatus({
    sessionId: req.params.id,
    actorUserId: req.user.userId,
    nextStatus: req.body.status,
    reason: req.body.reason,
  });

  return res.status(200).json(result);
};

export const completeSession = async (req: any, res: Response) => {
  const result = await SessionService.completeSession({
    sessionId: req.params.id,
    actorUserId: req.user.userId,
  });

  return res.status(200).json(result);
};

export const getSessionByOrder = async (req: any, res: Response) => {
  const result = await SessionService.getSessionByOrder({
    orderId: req.params.orderId,
    userId: req.user.userId,
  });

  return res.status(200).json(result);
};

export const getSessionByBundleBooking = async (req: any, res: Response) => {
  const result = await SessionService.getSessionByBundleBooking({
    bundleBookingId: req.params.bundleBookingId,
    userId: req.user.userId,
  });

  return res.status(200).json(result);
};

export const confirmSessionPayment = async (req: any, res: Response) => {
  const result = await SessionService.confirmSessionPayment({
    sessionId: req.params.sessionId,
    userId: req.user.userId,
    userRole: req.user.role,
  });

  return res.status(200).json(result);
};

export const getResumeSessionForUser = async (req: any, res: Response) => {
  const result = await SessionService.getResumeSessionForUser({
    requestedUserId: req.params.userId,
    actorUserId: req.user.userId,
  });

  return res.status(200).json(result);
};