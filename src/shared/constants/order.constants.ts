export const ORDER_STATUS = {
  PENDING: "pending",
  IN_PROGRESS: "in_progress",
  COMPLETED: "completed",
  CANCELLED: "cancelled",
} as const;

export type OrderStatus = (typeof ORDER_STATUS)[keyof typeof ORDER_STATUS];

export const ORDER_TYPE = {
  CONTRACT: "contract",
  DAILY: "daily",
} as const;

export type OrderType = (typeof ORDER_TYPE)[keyof typeof ORDER_TYPE];

export const ORDER_NOTIFICATION_TYPES = {
  OFFER_REJECTED: "OFFER_REJECTED",
  ORDER_CREATED: "ORDER_CREATED",
  ORDER_DELETED: "ORDER_DELETED",
  REVIEW_REQUIRED: "REVIEW_REQUIRED",
} as const;

export const ACTIVE_ORDER_STATUSES = [
  ORDER_STATUS.PENDING,
  ORDER_STATUS.IN_PROGRESS,
] as const;
