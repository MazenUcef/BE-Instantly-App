import { Router } from "express";
import { authenticate, authorize } from "../../../shared/middlewares/auth";
import {
  createBundle,
  getAllBundles,
  getBundleById,
  getMyBundles,
  updateBundle,
  toggleBundleStatus,
  deleteBundle,
} from "../controllers/bundle.controller";
import {
  validateBundleIdParam,
  validateCreateBundle,
  validateGetBundlesQuery,
  validateUpdateBundle,
} from "../validators/bundle.validation";

const router = Router();

router.get("/", authenticate, validateGetBundlesQuery, getAllBundles);

router.get("/me", authenticate, authorize("supplier"), getMyBundles);

router.get("/:id", authenticate, validateBundleIdParam, getBundleById);

router.post(
  "/",
  authenticate,
  authorize("supplier"),
  validateCreateBundle,
  createBundle,
);

router.put(
  "/:id",
  authenticate,
  authorize("supplier"),
  validateUpdateBundle,
  updateBundle,
);

router.patch(
  "/:id/toggle-status",
  authenticate,
  authorize("supplier"),
  validateBundleIdParam,
  toggleBundleStatus,
);

router.delete(
  "/:id",
  authenticate,
  authorize("supplier"),
  validateBundleIdParam,
  deleteBundle,
);

export default router;
