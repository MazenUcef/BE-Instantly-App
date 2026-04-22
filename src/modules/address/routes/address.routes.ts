import { Router } from "express";
import {
  createAddress,
  getUserAddresses,
  getAddressById,
  updateAddress,
  deleteAddress,
} from "../controllers/address.controller";
import { authenticate } from "../../../shared/middlewares/auth";
import {
  validateCreateAddress,
  validateListAddresses,
  validateAddressIdParam,
  validateUpdateAddress,
} from "../validators/address.validation";

const router = Router();

router.use(authenticate);

router.post("/", validateCreateAddress, createAddress);
router.get("/", validateListAddresses, getUserAddresses);
router.get("/:id", validateAddressIdParam, getAddressById);
router.put("/:id", validateUpdateAddress, updateAddress);
router.delete("/:id", validateAddressIdParam, deleteAddress);

export default router;
