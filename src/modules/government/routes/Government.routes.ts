import { Router } from "express";
import { authenticate, authorize } from "../../../shared/middlewares/auth";
import { validateCreateGovernment, validateDeleteGovernment, validateGetGovernmentById, validateToggleGovernmentStatus, validateUpdateGovernment } from "../validation/government.validation";
import { createGovernment, deleteGovernment, getAllGovernments, getAllGovernmentsAdmin, getGovernmentById, toggleGovernmentStatus, updateGovernment } from "../controller/government.controller";

const router = Router();

router.get("/", getAllGovernments);

router.get(
  "/admin/all",
  authenticate,
  authorize("admin"),
  getAllGovernmentsAdmin,
);

router.get("/:id", validateGetGovernmentById, getGovernmentById);

router.post(
  "/",
  authenticate,
  authorize("admin"),
  validateCreateGovernment,
  createGovernment,
);

router.put(
  "/:id",
  authenticate,
  authorize("admin"),
  validateUpdateGovernment,
  updateGovernment,
);

router.delete(
  "/:id",
  authenticate,
  authorize("admin"),
  validateDeleteGovernment,
  deleteGovernment,
);

router.patch(
  "/:id/toggle",
  authenticate,
  authorize("admin"),
  validateToggleGovernmentStatus,
  toggleGovernmentStatus,
);

export default router;