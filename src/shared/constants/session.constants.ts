export const SESSION_STATUS = {
  STARTED: "started",
  COMPLETED: "completed",
  CANCELLED: "cancelled",
} as const;

export type SessionStatus = (typeof SESSION_STATUS)[keyof typeof SESSION_STATUS];

export const SESSION_TERMINAL_STATUSES = [
  SESSION_STATUS.COMPLETED,
  SESSION_STATUS.CANCELLED,
] as const;

export const SESSION_CANCELLED_BY = {
  CUSTOMER: "customer",
  SUPPLIER: "supplier",
  SYSTEM: "system",
  ADMIN: "admin",
} as const;

export type SessionCancelledBy =
  (typeof SESSION_CANCELLED_BY)[keyof typeof SESSION_CANCELLED_BY];

export const SESSION_RESUME_ACTION = {
  NONE: "none",
  JOB_SESSION: "job_session",
  REVIEW: "review",
  PAYMENT_CONFIRMATION: "payment_confirmation",
} as const;

export const SESSION_NOTIFICATION_TYPES = {
  SESSION_CREATED: "SESSION_CREATED",
  SESSION_CANCELLED: "SESSION_CANCELLED",
  SESSION_COMPLETED: "SESSION_COMPLETED",
  SESSION_PAYMENT_CONFIRMED: "SESSION_PAYMENT_CONFIRMED",
  SUPPLIER_STATUS_UPDATE: "SUPPLIER_STATUS_UPDATE",
} as const;
