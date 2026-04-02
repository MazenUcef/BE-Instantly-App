import { Request, Response, NextFunction, RequestHandler } from "express";
import { body, param, query, validationResult } from "express-validator";
import { AVAILABILITY_ALLOWED_SLOT_DURATIONS } from "../../../shared/constants/availability.constants";

const TIME_REGEX = /^([01]\d|2[0-3]):([0-5]\d)$/;

const handleValidationErrors = (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const errors = validationResult(req);

  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: "Validation failed",
      errors: errors.array(),
    });
  }

  next();
};

export const validateUpsertAvailability: RequestHandler[] = [
  body("timezone").optional().isString().trim().isLength({ min: 1, max: 100 }),
  body("weeklySchedule").isArray({ min: 7, max: 7 }).withMessage("weeklySchedule must have 7 items"),

  body("weeklySchedule.*.dayOfWeek")
    .isInt({ min: 0, max: 6 })
    .withMessage("dayOfWeek must be between 0 and 6"),

  body("weeklySchedule.*.isWorking")
    .isBoolean()
    .withMessage("isWorking must be boolean"),

  body("weeklySchedule.*.slotDurationMinutes")
    .isInt()
    .custom((value) => AVAILABILITY_ALLOWED_SLOT_DURATIONS.includes(Number(value) as any))
    .withMessage("Invalid slotDurationMinutes"),

  body("weeklySchedule.*.startTime")
    .optional({ nullable: true })
    .matches(TIME_REGEX)
    .withMessage("startTime must be HH:mm"),

  body("weeklySchedule.*.endTime")
    .optional({ nullable: true })
    .matches(TIME_REGEX)
    .withMessage("endTime must be HH:mm"),

  body("weeklySchedule.*.breakStart")
    .optional({ nullable: true })
    .matches(TIME_REGEX)
    .withMessage("breakStart must be HH:mm"),

  body("weeklySchedule.*.breakEnd")
    .optional({ nullable: true })
    .matches(TIME_REGEX)
    .withMessage("breakEnd must be HH:mm"),

  handleValidationErrors,
];

export const validateBlockDate: RequestHandler[] = [
  body("date").notEmpty().isISO8601().withMessage("date must be a valid ISO date"),
  body("reason").optional().isString().trim().isLength({ max: 300 }),
  body("isFullDay").optional().isBoolean(),
  body("startTime")
    .optional({ nullable: true })
    .matches(TIME_REGEX)
    .withMessage("startTime must be HH:mm"),
  body("endTime")
    .optional({ nullable: true })
    .matches(TIME_REGEX)
    .withMessage("endTime must be HH:mm"),
  handleValidationErrors,
];

export const validateBlockedDateId: RequestHandler[] = [
  param("blockedDateId").isMongoId().withMessage("Invalid blockedDateId"),
  handleValidationErrors,
];

export const validateSupplierSlotsQuery: RequestHandler[] = [
  param("supplierId").isMongoId().withMessage("Invalid supplierId"),
  query("date").notEmpty().isISO8601().withMessage("date query is required and must be valid"),
  handleValidationErrors,
];