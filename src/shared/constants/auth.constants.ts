export const AUTH_ROLES = {
  CUSTOMER: "customer",
  SUPPLIER: "supplier",
  ADMIN: "admin",
} as const;

export const BIOMETRIC_TYPES = {
  FACE_ID: "faceid",
  FINGERPRINT: "fingerprint",
  PASSCODE: "passcode",
} as const;

export const AUTH_NOTIFICATION_TYPES = {
  ACCOUNT_VERIFIED: "account_verified",
  PASSWORD_CHANGED: "password_changed",
  ROLE_SWITCHED: "role_switched",
  DEVICE_REGISTERED: "device_registered",
  DEVICE_REMOVED: "device_removed",
} as const;

export const AUTH_QUEUE_EVENTS = {
  USER_REGISTERED: "USER_REGISTERED",
  EMAIL_JOBS: "email_jobs",
} as const;