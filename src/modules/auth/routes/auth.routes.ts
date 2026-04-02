import { Router } from "express";
import {
  register,
  verifyEmailOTP,
  resendVerificationEmail,
  login,
  refreshToken,
  logout,
  forgotPassword,
  verifyResetOTP,
  resetPassword,
  switchRole,
  getAllUsers,
  getUserById,
  updateUser,
  deleteUser,
  registerDevice,
  biometricLogin,
  removeDevice,
  changePassword,
} from "../controllers/auth.controller";
import { authenticate } from "../../../shared/middlewares/auth";
import {
  validateRegister,
  validateVerifyEmailOTP,
  validateResendVerificationEmail,
  validateLogin,
  validateRefreshToken,
  validateForgotPassword,
  validateVerifyResetOTP,
  validateResetPassword,
  validateSwitchRole,
  validateGetUserById,
  validateUpdateUser,
  validateDeleteUser,
  validateRegisterDevice,
  validateBiometricLogin,
  validateRemoveDevice,
  validateChangePassword,
} from "../validators/auth.validation";

const router = Router();

router.post("/register", validateRegister, register);
router.post("/verify-email", validateVerifyEmailOTP, verifyEmailOTP);
router.post(
  "/resend-verification",
  validateResendVerificationEmail,
  resendVerificationEmail,
);
router.post("/login", validateLogin, login);
router.post("/refresh", validateRefreshToken, refreshToken);
router.post("/logout", authenticate, logout);

router.post("/forgot-password", validateForgotPassword, forgotPassword);
router.post("/verify-reset-otp", validateVerifyResetOTP, verifyResetOTP);
router.post("/reset-password", validateResetPassword, resetPassword);
router.patch(
  "/change-password",
  authenticate,
  validateChangePassword,
  changePassword,
);

router.post("/switch-role", authenticate, validateSwitchRole, switchRole);

router.get("/", authenticate, getAllUsers);
router.get("/:id", authenticate, validateGetUserById, getUserById);
router.put("/:id", authenticate, validateUpdateUser, updateUser);
router.delete("/:id", authenticate, validateDeleteUser, deleteUser);

router.post(
  "/devices/register",
  authenticate,
  validateRegisterDevice,
  registerDevice,
);
router.post("/devices/login", validateBiometricLogin, biometricLogin);
router.delete(
  "/devices/remove",
  authenticate,
  validateRemoveDevice,
  removeDevice,
);

export default router;
