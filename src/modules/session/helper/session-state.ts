import { SESSION_STATUS, SESSION_TERMINAL_STATUSES } from "../../../shared/constants/session.constants";
import { AppError } from "../../../shared/middlewares/errorHandler";

const buildFullFlow = (workflowSteps: string[]) => [
  SESSION_STATUS.STARTED,
  ...workflowSteps,
  SESSION_STATUS.COMPLETED,
];

export const assertValidSessionTransition = (
  workflowSteps: string[],
  currentStatus: string,
  nextStatus: string,
) => {
  const fullFlow = buildFullFlow(workflowSteps);
  const currentIndex = fullFlow.indexOf(currentStatus);

  if (currentIndex === -1) {
    throw new AppError(`Unknown current status "${currentStatus}"`, 400);
  }

  const expectedNext = fullFlow[currentIndex + 1];

  if (expectedNext !== nextStatus) {
    throw new AppError(
      `Invalid session status transition from "${currentStatus}" to "${nextStatus}". Expected "${expectedNext}"`,
      400,
    );
  }
};

export const isSessionTerminal = (status: string) => {
  return (SESSION_TERMINAL_STATUSES as readonly string[]).includes(status);
};

export const canConfirmSessionPayment = (status: string) => {
  return status === SESSION_STATUS.COMPLETED;
};

export const canCompleteSession = (session: {
  workflowSteps: string[];
  currentStep: string | null;
}) => {
  const lastStep =
    session.workflowSteps[session.workflowSteps.length - 1] ??
    SESSION_STATUS.STARTED;
  const current = session.currentStep || SESSION_STATUS.STARTED;
  return current === lastStep;
};

export const canCancelSession = (status: string) => {
  return !isSessionTerminal(status);
};
