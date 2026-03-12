import { Router } from "express";
import { checkPendingOrders, createOrder, deleteOrder, getActiveOrdersByCategory, getCustomerOrderHistory, getOrderDetails, updateOrderPrice } from "../controllers/order.controller";
import { authenticate, authorize } from "../../../shared/middlewares/auth";
import { validateCreateOrder } from "../../../shared/middlewares/validate";


const router = Router();

router.post("/", authenticate, authorize("customer"), validateCreateOrder, createOrder);

router.delete("/:id", authenticate, authorize("customer"), deleteOrder);

router.get("/history", authenticate, authorize("customer"), getCustomerOrderHistory);

router.get("/active", authenticate, authorize("supplier"), getActiveOrdersByCategory);
router.patch("/:id/price", authenticate, authorize("customer"), updateOrderPrice);
router.get('/check-pending', authenticate, checkPendingOrders);




router.get("/:id", authenticate, getOrderDetails);

export default router;