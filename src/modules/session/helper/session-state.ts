import { SESSION_PROGRESS_TRANSITIONS, SESSION_STATUS, SESSION_TERMINAL_STATUSES, SessionStatus } from "../../../shared/constants/session.constants";
import { AppError } from "../../../shared/middlewares/errorHandler";


export const assertValidSessionTransition = (
  currentStatus: SessionStatus,
  nextStatus: SessionStatus,
) => {
  const allowed = SESSION_PROGRESS_TRANSITIONS[currentStatus] || [];

  if (!allowed.includes(nextStatus)) {
    throw new AppError(
      `Invalid session status transition from "${currentStatus}" to "${nextStatus}"`,
      400,
    );
  }
};

export const isSessionTerminal = (status: SessionStatus) => {
  return (SESSION_TERMINAL_STATUSES as readonly SessionStatus[]).includes(status);
};

export const canConfirmSessionPayment = (status: SessionStatus) => {
  return status === SESSION_STATUS.COMPLETED;
};

export const canCompleteSession = (status: SessionStatus) => {
  return status === SESSION_STATUS.WORK_STARTED;
};

export const canCancelSession = (status: SessionStatus) => {
  return [
    SESSION_STATUS.STARTED,
    SESSION_STATUS.ON_THE_WAY,
    SESSION_STATUS.ARRIVED,
    SESSION_STATUS.WORK_STARTED,
  ].includes(status as "started" | "on_the_way" | "arrived" | "work_started");
};