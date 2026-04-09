import { Response } from "express";
import { AvailabilityService } from "../services/availability.service";

export const getSupplierCalendar = async (req: any, res: Response) => {
  const result = await AvailabilityService.getSupplierCalendar({
    supplierId: req.params.supplierId,
    month: req.query.month as string,
  });

  return res.status(200).json(result);
};

export const getSupplierBookedTimes = async (req: any, res: Response) => {
  const result = await AvailabilityService.getSupplierBookedTimes({
    supplierId: req.params.supplierId,
    date: req.query.date as string,
  });

  return res.status(200).json(result);
};
