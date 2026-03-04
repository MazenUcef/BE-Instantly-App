import { Router } from "express";
import { authenticate, authorize } from "../../../shared/middlewares/auth";
import { createGovernment, deleteGovernment, getAllGovernments, getAllGovernmentsAdmin, getGovernmentById, toggleGovernmentStatus, updateGovernment } from "../controller/Government.controller";

const router = Router();


router.get("/", getAllGovernments);
router.get("/:id", getGovernmentById);


router.post("/", authenticate, authorize("admin"), createGovernment);
router.put("/:id", authenticate, authorize("admin"), updateGovernment);
router.delete("/:id", authenticate, authorize("admin"), deleteGovernment);
router.patch("/:id/toggle", authenticate, authorize("admin"), toggleGovernmentStatus);
router.get("/admin/all", authenticate, authorize("admin"), getAllGovernmentsAdmin);

export default router;