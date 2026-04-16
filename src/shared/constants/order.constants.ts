export const ORDER_STATUS = {
  PENDING: "pending",
  SCHEDULED: "scheduled",
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

export const ORDER_CANCELLED_BY = {
  CUSTOMER: "customer",
  SUPPLIER: "supplier",
  SYSTEM: "system",
  ADMIN: "admin",
} as const;

export type OrderCancelledBy =
  (typeof ORDER_CANCELLED_BY)[keyof typeof ORDER_CANCELLED_BY];

export const ORDER_ACTIVE_STATUSES = [
  ORDER_STATUS.PENDING,
  ORDER_STATUS.SCHEDULED,
  ORDER_STATUS.IN_PROGRESS,
] as const;

export const ORDER_TERMINAL_STATUSES = [
  ORDER_STATUS.COMPLETED,
  ORDER_STATUS.CANCELLED,
] as const;

export const ORDER_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  [ORDER_STATUS.PENDING]: [
    ORDER_STATUS.SCHEDULED,
    ORDER_STATUS.IN_PROGRESS,
    ORDER_STATUS.CANCELLED,
  ],
  [ORDER_STATUS.SCHEDULED]: [
    ORDER_STATUS.IN_PROGRESS,
    ORDER_STATUS.CANCELLED,
  ],
  [ORDER_STATUS.IN_PROGRESS]: [
    ORDER_STATUS.COMPLETED,
    ORDER_STATUS.CANCELLED,
  ],
  [ORDER_STATUS.COMPLETED]: [],
  [ORDER_STATUS.CANCELLED]: [],
};

export const ORDER_NOTIFICATION_TYPES = {
  OFFER_REJECTED: "OFFER_REJECTED",
  ORDER_CREATED: "ORDER_CREATED",
  ORDER_SCHEDULED: "ORDER_SCHEDULED",
  ORDER_CANCELLED: "ORDER_CANCELLED",
  ORDER_PRICE_UPDATED: "ORDER_PRICE_UPDATED",
  REVIEW_REQUIRED: "REVIEW_REQUIRED",
} as const;