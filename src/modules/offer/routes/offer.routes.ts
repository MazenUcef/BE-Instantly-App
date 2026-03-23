import { Router } from "express";
import {
  createOffer,
  acceptOffer,
  rejectOffer,
  getOffersByOrder,
  acceptOrderDirect,
  deleteOffer,
  getAcceptedOfferHistory,
  getSupplierPendingOffers,
} from "../controllers/offer.controller";
import { authenticate, authorize } from "../../../shared/middlewares/auth";

const router = Router();

router.post("/", authenticate, authorize("supplier"), createOffer);

router.put("/accept/:id", authenticate, authorize("customer"), acceptOffer);

router.put("/reject/:id", authenticate, authorize("customer"), rejectOffer);

router.get("/order/:orderId", authenticate, getOffersByOrder);

router.get(
  "/supplier/history",
  authenticate,
  authorize("supplier"),
  getAcceptedOfferHistory
);

router.delete(
  "/:id",
  authenticate,
  authorize("supplier"),
  deleteOffer
);

router.post(
  "/accept-order-direct/:orderId",
  authenticate,
  authorize("supplier"),
  acceptOrderDirect,
);

router.get(
  "/supplier/pending",
  authenticate,
  authorize("supplier"),
  getSupplierPendingOffers
);

export default router;
