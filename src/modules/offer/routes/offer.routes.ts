import { Router } from "express";
import { authenticate, authorizeCustomer, authorizeSupplier } from "../middlewares/auth";
import {
  createOffer,
  acceptOffer,
  rejectOffer,
  getOffersByOrder,
  checkActiveOffer,
  rejectOffersByOrder,
  acceptOrderDirect
} from "../controllers/offer.controller";

const router = Router();

router.post("/", authenticate, authorizeSupplier, createOffer);

router.put("/accept/:id", authenticate, authorizeCustomer, acceptOffer);
router.put("/reject/:id", authenticate, authorizeCustomer, rejectOffer);

router.get("/order/:orderId", authenticate, getOffersByOrder);

router.get("/check-active/:supplierId", checkActiveOffer);

router.put("/reject-by-order/:orderId", rejectOffersByOrder);

router.post("/accept-order-direct/:orderId", authenticate, authorizeSupplier, acceptOrderDirect);

export default router;