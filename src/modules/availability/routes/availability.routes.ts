import { Router } from "express";
import { authenticate, authorize } from "../../../shared/middlewares/auth";
import {
  getMyAvailability,
  upsertMyAvailability,
  blockDate,
  removeBlockedDate,
  getSupplierAvailableSlots,
} from "../controllers/availability.controller";
import {
  validateUpsertAvailability,
  validateBlockDate,
  validateBlockedDateId,
  validateSupplierSlotsQuery,
} from "../validators/availability.validation";

const router = Router();

router.get(
  "/me",
  authenticate,
  authorize("supplier"),
  getMyAvailability,
);

router.put(
  "/me",
  authenticate,
  authorize("supplier"),
  validateUpsertAvailability,
  upsertMyAvailability,
);

router.post(
  "/me/block-date",
  authenticate,
  authorize("supplier"),
  validateBlockDate,
  blockDate,
);

router.delete(
  "/me/block-date/:blockedDateId",
  authenticate,
  authorize("supplier"),
  validateBlockedDateId,
  removeBlockedDate,
);

router.get(
  "/supplier/:supplierId/slots",
  authenticate,
  validateSupplierSlotsQuery,
  getSupplierAvailableSlots,
);

export default router;