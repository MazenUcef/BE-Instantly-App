export const CHAT_SESSION_BLOCKED_STATUSES = ["completed", "cancelled"] as const;

export const CHAT_SOCKET_EVENTS = {
  MESSAGE_NEW: "message:new",
  MESSAGE_READ: "message:read",
  CHAT_SYNC: "chat:sync",
} as const;