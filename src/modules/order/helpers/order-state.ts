import { ORDER_STATUS, ORDER_TRANSITIONS, OrderStatus } from "../../../shared/constants/order.constants";
import { AppError } from "../../../shared/middlewares/errorHandler";


export const assertValidOrderTransition = (
  currentStatus: OrderStatus,
  nextStatus: OrderStatus,
) => {
  const allowed = ORDER_TRANSITIONS[currentStatus] || [];

  if (!allowed.includes(nextStatus)) {
    throw new AppError(
      `Invalid order status transition from "${currentStatus}" to "${nextStatus}"`,
      400,
    );
  }
};

export const canCustomerUpdateOrderPrice = (status: OrderStatus) => {
  return status === ORDER_STATUS.PENDING;
};

export const canCustomerCancelOrder = (status: OrderStatus) => {
  return ([ORDER_STATUS.PENDING, ORDER_STATUS.IN_PROGRESS] as OrderStatus[]).includes(status);
};