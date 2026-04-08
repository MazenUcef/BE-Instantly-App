import { Response } from "express";
import { OrderService } from "../services/order.service";

export const createOrder = async (req: any, res: Response) => {
  const result = await OrderService.createOrder({
    customerId: req.user.userId,
    customerName: req.user.name,
    address: req.body.address,
    description: req.body.description,
    categoryId: req.body.categoryId,
    governmentId: req.body.governmentId,
    requestedPrice: Number(req.body.requestedPrice),
    timeToStart: req.body.timeToStart,
    jobTitle: req.body.jobTitle,
    orderType: req.body.orderType,
    selectedWorkflow: req.body.selectedWorkflow,
  });

  return res.status(201).json(result);
};

export const updateOrderPrice = async (req: any, res: Response) => {
  const result = await OrderService.updateOrderPrice({
    orderId: req.params.id,
    customerId: req.user.userId,
    requestedPrice: Number(req.body.requestedPrice),
  });

  return res.status(200).json(result);
};

export const cancelOrder = async (req: any, res: Response) => {
  const result = await OrderService.cancelOrder({
    orderId: req.params.id,
    customerId: req.user.userId,
    cancellationReason: req.body.reason,
  });

  return res.status(200).json(result);
};

export const getActiveOrdersByCategory = async (req: any, res: Response) => {
  const result = await OrderService.getActiveOrdersByCategory({
    supplierId: req.user.userId,
    supplierCategoryId: req.user.categoryId,
    supplierGovernmentIds: req.user.governmentIds || [],
  });

  return res.status(200).json(result);
};

export const getOrderDetails = async (req: any, res: Response) => {
  const result = await OrderService.getOrderDetails({
    orderId: req.params.id,
    userId: req.user.userId,
    role: req.user.role,
    categoryId: req.user.categoryId,
    governmentIds: req.user.governmentIds || [],
  });

  return res.status(200).json(result);
};

export const getCustomerOrderHistory = async (req: any, res: Response) => {
  const result = await OrderService.getCustomerOrderHistory({
    customerId: req.user.userId,
    page: Number(req.query.page || 1),
    limit: Number(req.query.limit || 20),
  });

  return res.status(200).json(result);
};

export const checkPendingOrders = async (req: any, res: Response) => {
  const result = await OrderService.checkPendingOrders({
    userId: req.user.userId,
  });

  return res.status(200).json(result);
};