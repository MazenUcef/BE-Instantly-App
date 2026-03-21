import { Router } from "express";
import {
  createCategory,
  getAllCategories,
  getCategoryById,
  updateCategory,
  deleteCategory,
} from "../controllers/category.controller";
import { authenticate, authorize } from "../../../shared/middlewares/auth";
import upload from "../../../shared/config/multer";

const router = Router();

router.post("/", authenticate, authorize("admin"),upload.fields([{ name: 'image', maxCount: 1 }]), createCategory);

router.get("/", getAllCategories);

router.get("/:id", getCategoryById);

router.put("/:id", authenticate, authorize("admin"),upload.fields([{ name: 'image', maxCount: 1 }]), updateCategory);

router.delete("/:id", authenticate, authorize("admin"), deleteCategory);

export default router;
