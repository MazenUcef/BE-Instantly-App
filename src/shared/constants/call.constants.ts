export const CALL_TYPE = {
  AUDIO: "audio",
} as const;

export const CALL_STATUS = {
  INITIATED: "initiated",
  RINGING: "ringing",
  ACCEPTED: "accepted",
  DECLINED: "declined",
  MISSED: "missed",
  ENDED: "ended",
  FAILED: "failed",
} as const;

export const CALL_END_REASON = {
  CALLER_ENDED: "caller_ended",
  RECEIVER_ENDED: "receiver_ended",
  MISSED: "missed",
  DECLINED: "declined",
  FAILED: "failed",
  BUSY: "busy",
} as const;

export const ACTIVE_CALL_STATUSES = [
  CALL_STATUS.INITIATED,
  CALL_STATUS.RINGING,
  CALL_STATUS.ACCEPTED,
] as const;

export const FINAL_CALL_STATUSES = [
  CALL_STATUS.DECLINED,
  CALL_STATUS.MISSED,
  CALL_STATUS.ENDED,
  CALL_STATUS.FAILED,
] as const;

export const CALL_SOCKET_EVENTS = {
  INCOMING: "call:incoming",
  RINGING: "call:ringing",
  ACCEPTED: "call:accepted",
  DECLINED: "call:declined",
  ENDED: "call:ended",
  MISSED: "call:missed",
  FAILED: "call:failed",
} as const;

export const CALL_NOTIFICATION_TYPES = {
  INCOMING_CALL: "INCOMING_CALL",
  CALL_DECLINED: "CALL_DECLINED",
  MISSED_CALL: "MISSED_CALL",
} as const;

export const CALL_BLOCKED_SESSION_STATUSES = [
  "completed",
  "cancelled",
] as const;