import { Router } from "express";
import { authenticate, authorize } from "../../../shared/middlewares/auth";
import {
  cancelOrder,
  checkPendingOrders,
  createOrder,
  getActiveOrdersByCategory,
  getCustomerOrderHistory,
  getOrderDetails,
  getScheduledOrders,
  getTimeline,
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

router.get("/check-pending", authenticate, checkPendingOrders);

router.get(
  "/scheduled",
  authenticate,
  authorize("customer", "supplier"),
  getScheduledOrders,
);

router.get(
  "/timeline",
  authenticate,
  authorize("customer"),
  validateOrderHistoryQuery,
  getTimeline,
);

router.get("/:id", authenticate, validateOrderIdParam, getOrderDetails);

router.patch(
  "/:id/price",
  authenticate,
  authorize("customer"),
  validateUpdateOrderPrice,
  updateOrderPrice,
);

router.patch(
  "/:id/cancel",
  authenticate,
  authorize("customer"),
  validateOrderIdParam,
  cancelOrder,
);

export default router;
