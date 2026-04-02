import { Response } from "express";
import { AvailabilityService } from "../services/availability.service";

export const getMyAvailability = async (req: any, res: Response) => {
  const result = await AvailabilityService.getMyAvailability({
    supplierId: req.user.userId,
  });

  return res.status(200).json(result);
};

export const upsertMyAvailability = async (req: any, res: Response) => {
  const result = await AvailabilityService.upsertMyAvailability({
    supplierId: req.user.userId,
    timezone: req.body.timezone,
    weeklySchedule: req.body.weeklySchedule,
  });

  return res.status(200).json(result);
};

export const blockDate = async (req: any, res: Response) => {
  const result = await AvailabilityService.blockDate({
    supplierId: req.user.userId,
    date: req.body.date,
    reason: req.body.reason,
    isFullDay: req.body.isFullDay,
    startTime: req.body.startTime,
    endTime: req.body.endTime,
  });

  return res.status(201).json(result);
};

export const removeBlockedDate = async (req: any, res: Response) => {
  const result = await AvailabilityService.removeBlockedDate({
    supplierId: req.user.userId,
    blockedDateId: req.params.blockedDateId,
  });

  return res.status(200).json(result);
};

export const getSupplierAvailableSlots = async (req: any, res: Response) => {
  const result = await AvailabilityService.getSupplierAvailableSlots({
    supplierId: req.params.supplierId,
    date: req.query.date as string,
  });

  return res.status(200).json(result);
};