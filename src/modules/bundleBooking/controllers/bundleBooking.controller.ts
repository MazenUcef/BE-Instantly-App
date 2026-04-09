import { Response } from "express";
import { BundleBookingService } from "../services/bundleBooking.service";

export const createBundleBooking = async (req: any, res: Response) => {
  const result = await BundleBookingService.createBundleBooking({
    customerId: req.user.userId,
    bundleId: req.body.bundleId,
    governmentId: req.body.governmentId,
    address: req.body.address,
    notes: req.body.notes,
    bookedDate: req.body.bookedDate,
    slotStart: req.body.slotStart,
    slotEnd: req.body.slotEnd,
    scheduledAt: req.body.scheduledAt,
  });

  return res.status(201).json(result);
};

export const getSupplierBookings = async (req: any, res: Response) => {
  const result = await BundleBookingService.getSupplierBookings({
    supplierId: req.user.userId,
    status: req.query.status as string | undefined,
  });

  return res.status(200).json(result);
};

export const getCustomerBookings = async (req: any, res: Response) => {
  const result = await BundleBookingService.getCustomerBookings({
    customerId: req.user.userId,
    status: req.query.status as string | undefined,
  });

  return res.status(200).json(result);
};

export const getBookingById = async (req: any, res: Response) => {
  const result = await BundleBookingService.getBookingById({
    bookingId: req.params.id,
    userId: req.user.userId,
  });

  return res.status(200).json(result);
};

export const acceptBundleBooking = async (req: any, res: Response) => {
  const result = await BundleBookingService.acceptBundleBooking({
    bookingId: req.params.id,
    supplierId: req.user.userId,
  });

  return res.status(200).json(result);
};

export const rejectBundleBooking = async (req: any, res: Response) => {
  const result = await BundleBookingService.rejectBundleBooking({
    bookingId: req.params.id,
    supplierId: req.user.userId,
    rejectionReason: req.body.rejectionReason,
  });

  return res.status(200).json(result);
};

export const proposeTime = async (req: any, res: Response) => {
  const result = await BundleBookingService.proposeTime({
    bookingId: req.params.id,
    userId: req.user.userId,
    proposedBookedDate: req.body.proposedBookedDate,
    proposedSlotStart: req.body.proposedSlotStart,
    proposedSlotEnd: req.body.proposedSlotEnd,
    proposedScheduledAt: req.body.proposedScheduledAt,
  });

  return res.status(200).json(result);
};

export const acceptProposal = async (req: any, res: Response) => {
  const result = await BundleBookingService.acceptProposal({
    bookingId: req.params.id,
    userId: req.user.userId,
  });

  return res.status(200).json(result);
};

export const startBundleBooking = async (req: any, res: Response) => {
  const result = await BundleBookingService.startBundleBooking({
    bookingId: req.params.id,
    supplierId: req.user.userId,
  });

  return res.status(200).json(result);
};

export const markBundleBookingDone = async (req: any, res: Response) => {
  const result = await BundleBookingService.markBundleBookingDone({
    bookingId: req.params.id,
    supplierId: req.user.userId,
  });

  return res.status(200).json(result);
};

export const confirmBundlePayment = async (req: any, res: Response) => {
  const result = await BundleBookingService.confirmBundlePayment({
    bookingId: req.params.id,
    supplierId: req.user.userId,
  });

  return res.status(200).json(result);
};

export const cancelBundleBooking = async (req: any, res: Response) => {
  const result = await BundleBookingService.cancelBundleBooking({
    bookingId: req.params.id,
    userId: req.user.userId,
  });

  return res.status(200).json(result);
};
