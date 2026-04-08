import {
  OFFER_STATUS,
  OFFER_TERMINAL_STATUSES,
  OFFER_TRANSITIONS,
  OfferStatus,
} from "../../../shared/constants/offer.constants";
import { AppError } from "../../../shared/middlewares/errorHandler";

export const assertValidOfferTransition = (
  currentStatus: OfferStatus,
  nextStatus: OfferStatus,
) => {
  const allowed = OFFER_TRANSITIONS[currentStatus] || [];

  if (!allowed.includes(nextStatus)) {
    throw new AppError(
      `Invalid offer status transition from "${currentStatus}" to "${nextStatus}"`,
      400,
    );
  }
};

export const isOfferTerminal = (status: OfferStatus) => {
  return (OFFER_TERMINAL_STATUSES as readonly OfferStatus[]).includes(status);
};

export const canSupplierWithdrawOffer = (status: OfferStatus) => {
  return (
    status === OFFER_STATUS.PENDING || status === OFFER_STATUS.ACCEPTED
  );
};

export const canCustomerAcceptOffer = (status: OfferStatus) => {
  return status === OFFER_STATUS.PENDING;
};

export const canCustomerRejectOffer = (status: OfferStatus) => {
  return status === OFFER_STATUS.PENDING;
};
