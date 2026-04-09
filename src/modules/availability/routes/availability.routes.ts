import { Router } from "express";
import { authenticate } from "../../../shared/middlewares/auth";
import {
  getSupplierCalendar,
  getSupplierBookedTimes,
} from "../controllers/availability.controller";
import {
  validateSupplierCalendarQuery,
  validateSupplierBookedTimesQuery,
} from "../validators/availability.validation";

const router = Router();

router.get(
  "/supplier/:supplierId/calendar",
  authenticate,
  validateSupplierCalendarQuery,
  getSupplierCalendar,
);

router.get(
  "/supplier/:supplierId/booked-times",
  authenticate,
  validateSupplierBookedTimesQuery,
  getSupplierBookedTimes,
);

export default router;
