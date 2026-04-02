import { Router } from "express";
import { authenticate, authorize } from "../../../shared/middlewares/auth";
import {
  checkPendingOrders,
  createOrder,
  deleteOrder,
  getActiveOrdersByCategory,
  getCustomerOrderHistory,
  getOrderDetails,
  updateOrderPrice,
} from "../controllers/order.controller";
import {
  validateCreateOrder,
  validateOrderHistoryQuery,
  validateOrderIdParam,
  validateUpdateOrderPrice,
} from "../validators/order.validation";

const router = Router();

router.post(
  "/",
  authenticate,
  authorize("customer"),
  validateCreateOrder,
  createOrder,
);

router.get(
  "/history",
  authenticate,
  authorize("customer"),
  validateOrderHistoryQuery,
  getCustomerOrderHistory,
);

router.get(
  "/active",
  authenticate,
  authorize("supplier"),
  getActiveOrdersByCategory,
);

router.get(
  "/check-pending",
  authenticate,
  checkPendingOrders,
);

router.get(
  "/:id",
  authenticate,
  validateOrderIdParam,
  getOrderDetails,
);

router.patch(
  "/:id/price",
  authenticate,
  authorize("customer"),
  validateUpdateOrderPrice,
  updateOrderPrice,
);

router.delete(
  "/:id",
  authenticate,
  authorize("customer"),
  validateOrderIdParam,
  deleteOrder,
);

export default router;