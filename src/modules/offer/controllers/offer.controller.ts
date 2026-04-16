import { Response } from "express";
import { OfferService } from "../service/offer.service";

export const createOffer = async (req: any, res: Response) => {
  const result = await OfferService.createOffer({
    supplierId: req.user.userId,
    orderId: req.body.orderId,
    amount: Number(req.body.amount),
    estimatedDuration: req.body.estimatedDuration ? Number(req.body.estimatedDuration) : null,
    expectedDays: req.body.expectedDays ? Number(req.body.expectedDays) : null,
    timeToStart: req.body.timeToStart ?? null,
  });

  return res.status(result.created ? 201 : 200).json(result);
};

export const acceptOffer = async (req: any, res: Response) => {
  const result = await OfferService.acceptOffer({
    offerId: req.params.id,
    customerId: req.user.userId,
  });

  return res.status(200).json(result);
};

export const rejectOffer = async (req: any, res: Response) => {
  const result = await OfferService.rejectOffer({
    offerId: req.params.id,
    customerId: req.user.userId,
  });

  return res.status(200).json(result);
};

export const deleteOffer = async (req: any, res: Response) => {
  const result = await OfferService.deleteOffer({
    offerId: req.params.id,
    supplierId: req.user.userId,
    reason: req.body.reason,
  });

  return res.status(200).json(result);
};

export const getOffersByOrder = async (req: any, res: Response) => {
  const result = await OfferService.getOffersByOrder({
    orderId: req.params.orderId,
    userId: req.user.userId,
    role: req.user.role,
  });

  return res.status(200).json(result);
};

export const acceptOrderDirect = async (req: any, res: Response) => {
  const result = await OfferService.acceptOrderDirect({
    orderId: req.params.orderId,
    supplierId: req.user.userId,
  });

  return res.status(200).json(result);
};

export const getAcceptedOfferHistory = async (req: any, res: Response) => {
  const result = await OfferService.getAcceptedOfferHistory({
    supplierId: req.user.userId,
    page: Number(req.query.page || 1),
    limit: Number(req.query.limit || 20),
  });

  return res.status(200).json(result);
};

export const getSupplierPendingOffers = async (req: any, res: Response) => {
  const result = await OfferService.getSupplierPendingOffers({
    supplierId: req.user.userId,
    page: Number(req.query.page || 1),
    limit: Number(req.query.limit || 20),
  });

  return res.status(200).json(result);
};
