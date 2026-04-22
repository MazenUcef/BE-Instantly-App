import { Request, Response, NextFunction, RequestHandler } from "express";
import { body, param, validationResult } from "express-validator";
import upload from "../../../shared/config/multer";
import {
  AUTH_ROLES,
  BIOMETRIC_TYPES,
} from "../../../shared/constants/auth.constants";

export const handleValidationErrors = (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const errors = validationResult(req);

  if (!errors.isEmpty()) {
    console.log("Validation errors:", JSON.stringify(errors.array(), null, 2));
    return res.status(400).json({
      success: false,
      message: "Validation failed",
      errors: errors.array(),
    });
  }

  next();
};

const egyptPhoneRegex = /^01[0-9]{9}$/;
const nameRegex = /^[a-zA-Z\u0600-\u06FF\s]+$/;

export const validateRegister: RequestHandler[] = [
  upload.fields([{ name: "profilePicture", maxCount: 1 }]),

  (req, res, next) => {
    const files = req.files as {
      profilePicture?: Express.Multer.File[];
    };

    if (!files?.profilePicture?.[0]) {
      return res.status(400).json({
        success: false,
        message: "Profile picture is required",
      });
    }

    next();
  },

  body("firstName")
    .notEmpty()
    .withMessage("First name is required")
    .bail()
    .isString()
    .withMessage("First name must be a string")
    .bail()
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage("First name must be between 2 and 50 characters")
    .bail()
    .matches(nameRegex)
    .withMessage("First name can only contain letters and spaces"),

  body("lastName")
    .notEmpty()
    .withMessage("Last name is required")
    .bail()
    .isString()
    .withMessage("Last name must be a string")
    .bail()
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage("Last name must be between 2 and 50 characters")
    .bail()
    .matches(nameRegex)
    .withMessage("Last name can only contain letters and spaces"),

  body("email")
    .notEmpty()
    .withMessage("Email is required")
    .bail()
    .isEmail()
    .withMessage("Invalid email format")
    .bail()
    .normalizeEmail()
    .isLength({ max: 100 })
    .withMessage("Email is too long"),

  body("phoneNumber")
    .notEmpty()
    .withMessage("Phone number is required")
    .bail()
    .isString()
    .withMessage("Phone number must be a string")
    .bail()
    .trim()
    .matches(egyptPhoneRegex)
    .withMessage(
      "Phone number must be a valid Egyptian mobile number starting with 01",
    ),

  body("password")
    .notEmpty()
    .withMessage("Password is required")
    .bail()
    .isString()
    .withMessage("Password must be a string")
    .bail()
    .isLength({ min: 8, max: 100 })
    .withMessage("Password must be between 8 and 100 characters")
    .bail()
    .matches(/[A-Z]/)
    .withMessage("Password must contain at least one uppercase letter")
    .bail()
    .matches(/[a-z]/)
    .withMessage("Password must contain at least one lowercase letter")
    .bail()
    .matches(/[0-9]/)
    .withMessage("Password must contain at least one number")
    .bail()
    .matches(/[!@#$%^&*(),.?":{}|<>_\-\\/\[\]+=;']/)
    .withMessage("Password must contain at least one special character"),

  body("address")
    .notEmpty()
    .withMessage("Address is required")
    .bail()
    .isString()
    .withMessage("Address must be a string")
    .bail()
    .trim()
    .isLength({ min: 5, max: 200 })
    .withMessage("Address must be between 5 and 200 characters"),

  body("role")
    .notEmpty()
    .withMessage("Role is required")
    .isIn([AUTH_ROLES.CUSTOMER, AUTH_ROLES.SUPPLIER])
    .withMessage("Role must be either customer or supplier"),

  body("categoryId")
    .if(body("role").equals(AUTH_ROLES.SUPPLIER))
    .notEmpty()
    .withMessage("Category is required for supplier")
    .bail()
    .isUUID()
    .withMessage("Invalid category ID"),

  body("jobTitles")
    .if(body("role").equals(AUTH_ROLES.SUPPLIER))
    .isArray({ min: 1 })
    .withMessage("At least one job title is required for supplier"),

  body("jobTitles.*")
    .if(body("role").equals(AUTH_ROLES.SUPPLIER))
    .isString()
    .withMessage("Each job title must be a string")
    .bail()
    .trim()
    .notEmpty()
    .withMessage("Job title cannot be empty")
    .bail()
    .isLength({ min: 2, max: 50 })
    .withMessage("Job title must be between 2 and 50 characters"),

  body("governmentIds")
    .if(body("role").equals(AUTH_ROLES.SUPPLIER))
    .isArray({ min: 1 })
    .withMessage(
      "At least one government/service area is required for supplier",
    ),

  body("governmentIds.*")
    .if(body("role").equals(AUTH_ROLES.SUPPLIER))
    .isUUID()
    .withMessage("Each government ID must be a valid UUID"),

  handleValidationErrors,
];

export const validateVerifyEmailOTP: RequestHandler[] = [
  body("email")
    .notEmpty()
    .withMessage("Email is required")
    .bail()
    .isEmail()
    .withMessage("Invalid email")
    .bail()
    .normalizeEmail(),

  body("otp")
    .notEmpty()
    .withMessage("OTP is required")
    .bail()
    .isString()
    .withMessage("OTP must be a string")
    .bail()
    .trim()
    .isLength({ min: 6, max: 6 })
    .withMessage("OTP must be exactly 6 digits")
    .bail()
    .isNumeric()
    .withMessage("OTP must contain only numbers"),

  handleValidationErrors,
];

export const validateResendVerificationEmail: RequestHandler[] = [
  body("email")
    .notEmpty()
    .withMessage("Email is required")
    .bail()
    .isEmail()
    .withMessage("Invalid email")
    .bail()
    .normalizeEmail(),

  handleValidationErrors,
];

export const validateLogin: RequestHandler[] = [
  body("email")
    .notEmpty()
    .withMessage("Email is required")
    .bail()
    .isEmail()
    .withMessage("Invalid email")
    .bail()
    .normalizeEmail(),

  body("password")
    .notEmpty()
    .withMessage("Password is required")
    .bail()
    .isString()
    .withMessage("Password must be a string"),

  handleValidationErrors,
];

export const validateRefreshToken: RequestHandler[] = [
  body("refreshToken")
    .notEmpty()
    .withMessage("Refresh token is required")
    .bail()
    .isString()
    .withMessage("Refresh token must be a string")
    .bail()
    .isLength({ min: 10 })
    .withMessage("Invalid refresh token"),

  handleValidationErrors,
];

export const validateForgotPassword: RequestHandler[] = [
  body("email")
    .notEmpty()
    .withMessage("Email is required")
    .bail()
    .isEmail()
    .withMessage("Invalid email")
    .bail()
    .normalizeEmail(),

  handleValidationErrors,
];

export const validateVerifyResetOTP: RequestHandler[] = [
  body("email")
    .notEmpty()
    .withMessage("Email is required")
    .bail()
    .isEmail()
    .withMessage("Invalid email")
    .bail()
    .normalizeEmail(),

  body("otp")
    .notEmpty()
    .withMessage("OTP is required")
    .bail()
    .isString()
    .withMessage("OTP must be a string")
    .bail()
    .trim()
    .isLength({ min: 6, max: 6 })
    .withMessage("OTP must be exactly 6 digits")
    .bail()
    .isNumeric()
    .withMessage("OTP must contain only numbers"),

  handleValidationErrors,
];

export const validateResetPassword: RequestHandler[] = [
  body("token")
    .notEmpty()
    .withMessage("Token is required")
    .bail()
    .isString()
    .withMessage("Token must be a string")
    .bail()
    .isLength({ min: 10 })
    .withMessage("Invalid token"),

  body("password")
    .notEmpty()
    .withMessage("Password is required")
    .bail()
    .isString()
    .withMessage("Password must be a string")
    .bail()
    .isLength({ min: 8, max: 100 })
    .withMessage("Password must be between 8 and 100 characters")
    .bail()
    .matches(/[A-Z]/)
    .withMessage("Password must contain at least one uppercase letter")
    .bail()
    .matches(/[a-z]/)
    .withMessage("Password must contain at least one lowercase letter")
    .bail()
    .matches(/[0-9]/)
    .withMessage("Password must contain at least one number")
    .bail()
    .matches(/[!@#$%^&*(),.?":{}|<>_\-\\/\[\]+=;']/)
    .withMessage("Password must contain at least one special character"),

  handleValidationErrors,
];

export const validateSwitchRole: RequestHandler[] = [
  body("targetRole")
    .notEmpty()
    .withMessage("Target role is required")
    .bail()
    .isIn([AUTH_ROLES.CUSTOMER, AUTH_ROLES.SUPPLIER])
    .withMessage("Target role must be either customer or supplier"),

  body("categoryId").optional().isUUID().withMessage("Invalid category ID"),

  body("jobs").optional().isArray().withMessage("Jobs must be an array"),

  body("jobs.*")
    .optional()
    .isString()
    .withMessage("Each job must be a string")
    .bail()
    .trim()
    .notEmpty()
    .withMessage("Job cannot be empty")
    .bail()
    .isLength({ min: 2, max: 50 })
    .withMessage("Job must be between 2 and 50 characters"),

  body("governmentIds")
    .optional()
    .isArray()
    .withMessage("Government IDs must be an array"),

  body("governmentIds.*")
    .optional()
    .isUUID()
    .withMessage("Each government ID must be a valid UUID"),

  handleValidationErrors,
];

export const validateChangePassword: RequestHandler[] = [
  body("currentPassword")
    .notEmpty()
    .withMessage("Current password is required")
    .bail()
    .isString()
    .withMessage("Current password must be a string"),

  body("newPassword")
    .notEmpty()
    .withMessage("New password is required")
    .bail()
    .isString()
    .withMessage("New password must be a string")
    .bail()
    .isLength({ min: 8, max: 100 })
    .withMessage("New password must be between 8 and 100 characters")
    .bail()
    .matches(/[A-Z]/)
    .withMessage("New password must contain at least one uppercase letter")
    .bail()
    .matches(/[a-z]/)
    .withMessage("New password must contain at least one lowercase letter")
    .bail()
    .matches(/[0-9]/)
    .withMessage("New password must contain at least one number")
    .bail()
    .matches(/[!@#$%^&*(),.?":{}|<>_\-\\/\[\]+=;']/)
    .withMessage("New password must contain at least one special character"),

  handleValidationErrors,
];

export const validateGetUserById: RequestHandler[] = [
  param("id").isUUID().withMessage("Invalid user ID"),
  handleValidationErrors,
];

export const validateUpdateUser: RequestHandler[] = [
  param("id").isUUID().withMessage("Invalid user ID"),

  body("firstName")
    .optional()
    .isString()
    .withMessage("First name must be a string")
    .bail()
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage("First name must be between 2 and 50 characters")
    .bail()
    .matches(nameRegex)
    .withMessage("First name can only contain letters and spaces"),

  body("lastName")
    .optional()
    .isString()
    .withMessage("Last name must be a string")
    .bail()
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage("Last name must be between 2 and 50 characters")
    .bail()
    .matches(nameRegex)
    .withMessage("Last name can only contain letters and spaces"),

  body("address")
    .optional()
    .isString()
    .withMessage("Address must be a string")
    .bail()
    .trim()
    .isLength({ min: 5, max: 200 })
    .withMessage("Address must be between 5 and 200 characters"),

  body("phoneNumber")
    .optional()
    .isString()
    .withMessage("Phone number must be a string")
    .bail()
    .trim()
    .matches(egyptPhoneRegex)
    .withMessage(
      "Phone number must be a valid Egyptian mobile number starting with 01",
    ),

  body("profilePicture")
    .optional()
    .isString()
    .withMessage("Profile picture must be a string")
    .bail()
    .trim()
    .isLength({ min: 5, max: 500 })
    .withMessage("Profile picture URL is invalid"),

  body([
    "role",
    "isEmailVerified",
    "isPhoneVerified",
    "isProfileComplete",
    "averageRating",
    "totalReviews",
    "governmentIds",
    "categoryId",
    "jobTitles",
    "biometrics",
    "password",
  ])
    .not()
    .exists()
    .withMessage("This field is not allowed to be updated from this endpoint"),

  handleValidationErrors,
];

export const validateDeleteUser: RequestHandler[] = [
  param("id").isUUID().withMessage("Invalid user ID"),
  handleValidationErrors,
];

export const validateRegisterDevice: RequestHandler[] = [
  body("deviceId")
    .notEmpty()
    .withMessage("Device ID is required")
    .bail()
    .isString()
    .withMessage("Device ID must be a string")
    .bail()
    .trim()
    .isLength({ min: 3, max: 200 })
    .withMessage("Device ID must be between 3 and 200 characters"),

  body("type")
    .notEmpty()
    .withMessage("Biometric type is required")
    .bail()
    .isIn(Object.values(BIOMETRIC_TYPES))
    .withMessage("Invalid biometric type"),

  body("passcode")
    .if(body("type").equals(BIOMETRIC_TYPES.PASSCODE))
    .notEmpty()
    .withMessage("Passcode is required for passcode login")
    .bail()
    .isString()
    .withMessage("Passcode must be a string")
    .bail()
    .isLength({ min: 4, max: 20 })
    .withMessage("Passcode must be between 4 and 20 characters"),

  handleValidationErrors,
];

export const validateBiometricLogin: RequestHandler[] = [
  body("deviceId")
    .notEmpty()
    .withMessage("Device ID is required")
    .bail()
    .isString()
    .withMessage("Device ID must be a string")
    .bail()
    .trim(),

  body("type")
    .notEmpty()
    .withMessage("Biometric type is required")
    .bail()
    .isIn(Object.values(BIOMETRIC_TYPES))
    .withMessage("Invalid biometric type"),

  body("passcode")
    .if(body("type").equals(BIOMETRIC_TYPES.PASSCODE))
    .notEmpty()
    .withMessage("Passcode is required for passcode login")
    .bail()
    .isString()
    .withMessage("Passcode must be a string"),

  handleValidationErrors,
];

export const validateRemoveDevice: RequestHandler[] = [
  body("deviceId")
    .notEmpty()
    .withMessage("Device ID is required")
    .bail()
    .isString()
    .withMessage("Device ID must be a string")
    .bail()
    .trim()
    .isLength({ min: 3, max: 200 })
    .withMessage("Device ID must be between 3 and 200 characters"),

  handleValidationErrors,
];
