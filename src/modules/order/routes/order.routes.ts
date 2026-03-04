import { Router } from "express";
import { createOrder, deleteOrder, getActiveOrdersByCategory, getCustomerOrderHistory, getOrderDetails, getPendingReviewBySupplier, lockAndStartOrder, markOrderReviewed, updateOrderPrice, updateOrderStatus } from "../controllers/order.controller";
import { authenticate, authorize } from "../../../shared/middlewares/auth";
import { validateCreateOrder } from "../../../shared/middlewares/validate";


const router = Router();

router.post("/", authenticate, authorize("customer"), validateCreateOrder, createOrder);
router.delete("/:id", authenticate, authorize("customer"), deleteOrder);
router.get("/history", authenticate, authorize("customer"), getCustomerOrderHistory);

router.get("/active", authenticate, authorize("supplier"), getActiveOrdersByCategory);
router.get("/:id", authenticate, getOrderDetails);

router.put("/:id/status", authenticate, updateOrderStatus);

router.patch("/:id/review", authenticate, markOrderReviewed);

router.patch("/:id/price", authenticate, authorize("customer"), updateOrderPrice);

router.put("/:id/lock-and-start", authenticate, authorize("supplier"), lockAndStartOrder);

router.get("/supplier/:supplierId/pending-review",getPendingReviewBySupplier);

export default router;