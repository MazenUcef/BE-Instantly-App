import { Router } from "express";
import { authenticate, authorize } from "../../../shared/middlewares/auth";
import {
  acceptOffer,
  acceptOrderDirect,
  createOffer,
  deleteOffer,
  getAcceptedOfferHistory,
  getOffersByOrder,
  getSupplierPendingOffers,
  rejectOffer,
} from "../controllers/offer.controller";
import {
  validateAcceptOrderDirect,
  validateCreateOffer,
  validateDeleteOffer,
  validateOfferHistoryQuery,
  validateOfferIdParam,
  validateOrderIdParam,
} from "../validation/offer.validation";

const router = Router();

router.post(
  "/",
  authenticate,
  authorize("supplier"),
  validateCreateOffer,
  createOffer,
);

router.put(
  "/accept/:id",
  authenticate,
  authorize("customer"),
  validateOfferIdParam,
  acceptOffer,
);

router.put(
  "/reject/:id",
  authenticate,
  authorize("customer"),
  validateOfferIdParam,
  rejectOffer,
);

router.get(
  "/order/:orderId",
  authenticate,
  validateOrderIdParam,
  getOffersByOrder,
);

router.get(
  "/supplier/history",
  authenticate,
  authorize("supplier"),
  validateOfferHistoryQuery,
  getAcceptedOfferHistory,
);

router.delete(
  "/:id",
  authenticate,
  authorize("supplier"),
  validateDeleteOffer,
  deleteOffer,
);

router.post(
  "/accept-order-direct/:orderId",
  authenticate,
  authorize("supplier"),
  validateOrderIdParam,
  validateAcceptOrderDirect,
  acceptOrderDirect,
);

router.get(
  "/supplier/pending",
  authenticate,
  authorize("supplier"),
  validateOfferHistoryQuery,
  getSupplierPendingOffers,
);

export default router;
