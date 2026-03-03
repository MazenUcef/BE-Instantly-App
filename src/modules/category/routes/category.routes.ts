import { Router } from "express";
import {
  createCategory,
  getAllCategories,
  getCategoryById,
  updateCategory,
  deleteCategory,
} from "../controllers/category.controller";
import { authenticate, authorize } from "../../../shared/middlewares/auth";

const router = Router();

router.post("/", authenticate, authorize("admin"), createCategory);

router.get("/", getAllCategories);

router.get("/:id", getCategoryById);

router.put("/:id", authenticate, authorize("admin"), updateCategory);

router.delete("/:id", authenticate, authorize("admin"), deleteCategory);

export default router;
