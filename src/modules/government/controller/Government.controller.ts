import { Request, Response } from "express";
import { GovernmentService } from "../service/government.service";

export const createGovernment = async (req: Request, res: Response) => {
  const result = await GovernmentService.createGovernment({
    name: req.body.name,
    nameAr: req.body.nameAr,
    country: req.body.country,
    order: req.body.order,
  });

  return res.status(201).json(result);
};

export const getAllGovernments = async (_req: Request, res: Response) => {
  const result = await GovernmentService.getAllGovernments();
  return res.status(200).json(result);
};

export const getAllGovernmentsAdmin = async (_req: Request, res: Response) => {
  const result = await GovernmentService.getAllGovernmentsAdmin();
  return res.status(200).json(result);
};

export const getGovernmentById = async (req: Request, res: Response) => {
  const result = await GovernmentService.getGovernmentById(req.params.id as string);
  return res.status(200).json(result);
};

export const updateGovernment = async (req: Request, res: Response) => {
  const result = await GovernmentService.updateGovernment(req.params.id as string, {
    name: req.body.name,
    nameAr: req.body.nameAr,
    country: req.body.country,
    order: req.body.order,
    isActive: req.body.isActive,
  });

  return res.status(200).json(result);
};

export const deleteGovernment = async (req: Request, res: Response) => {
  const result = await GovernmentService.deleteGovernment(req.params.id as string);
  return res.status(200).json(result);
};

export const toggleGovernmentStatus = async (req: Request, res: Response) => {
  const result = await GovernmentService.toggleGovernmentStatus(req.params.id as string);
  return res.status(200).json(result);
};