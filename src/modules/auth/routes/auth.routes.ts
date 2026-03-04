import { Router } from "express";
import {
  register,
  verifyEmailOTP,
  login,
  refreshToken,
  logout,
  forgotPassword,
  resetPassword,
  switchRole,
  getAllUsers,
  getUserById,
  updateUser,
  deleteUser,
  updateUserRating,
  resendVerificationEmail,
  verifyResetOTP,
  registerDevice,
  biometricLogin,
  removeDevice,
} from "../controllers/auth.controller";
import { validateForgotPassword, validateLogin, validateRefreshToken, validateRegister, validateResendVerification, validateResetPassword, validateVerifyEmailOTP, validateVerifyResetOTP } from "../../../shared/middlewares/validate";
import { authenticate } from "../../../shared/middlewares/auth";

const router = Router();

router.post("/register", validateRegister, register);

// router.post('/verify-phone', validateVerifyPhoneOTP, verifyPhoneOTP);

router.post("/verify-email", validateVerifyEmailOTP, verifyEmailOTP);

router.post("/resend-verification", validateResendVerification, resendVerificationEmail);

router.post("/login", validateLogin, login);

router.post("/refresh", validateRefreshToken, refreshToken);

router.post("/logout", authenticate, logout);

router.post("/forgot-password", validateForgotPassword, forgotPassword);
router.post("/verify-reset-otp", validateVerifyResetOTP, verifyResetOTP);
router.post("/reset-password", validateResetPassword, resetPassword);

router.post("/switch-role", authenticate, switchRole);

router.get("/", authenticate, getAllUsers);

router.get("/:id", authenticate, getUserById);

router.put("/:id", authenticate, updateUser);

router.delete("/:id", authenticate, deleteUser);

router.patch("/:id/update-rating", updateUserRating);

router.post("/devices/register", authenticate, registerDevice);
router.post("/devices/login", biometricLogin);
router.delete("/devices/remove", authenticate, removeDevice);

export default router;
