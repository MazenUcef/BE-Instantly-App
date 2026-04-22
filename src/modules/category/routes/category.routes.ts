import { Router } from "express";
import {
  createCategory,
  getAllCategories,
  getCategoryById,
  updateCategory,
  deleteCategory,
} from "../controllers/category.controller";
import { authenticate, authorize } from "../../../shared/middlewares/auth";
import {
  validateCreateCategory,
  validateGetCategoryById,
  validateUpdateCategory,
  validateDeleteCategory,
} from "../validators/category.validation";

const router = Router();

router.post(
  "/",
  authenticate,
  authorize("admin"),
  validateCreateCategory,
  createCategory,
);

router.get("/", getAllCategories);

router.get("/:id", validateGetCategoryById, getCategoryById);

router.put(
  "/:id",
  authenticate,
  authorize("admin"),
  validateUpdateCategory,
  updateCategory,
);

router.delete(
  "/:id",
  authenticate,
  authorize("admin"),
  validateDeleteCategory,
  deleteCategory,
);

export default router;