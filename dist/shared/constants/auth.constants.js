"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AUTH_QUEUE_EVENTS = exports.AUTH_NOTIFICATION_TYPES = exports.BIOMETRIC_TYPES = exports.AUTH_ROLES = void 0;
exports.AUTH_ROLES = {
    CUSTOMER: "customer",
    SUPPLIER: "supplier",
    ADMIN: "admin",
};
exports.BIOMETRIC_TYPES = {
    FACE_ID: "faceid",
    FINGERPRINT: "fingerprint",
    PASSCODE: "passcode",
};
exports.AUTH_NOTIFICATION_TYPES = {
    ACCOUNT_VERIFIED: "account_verified",
    PASSWORD_CHANGED: "password_changed",
    ROLE_SWITCHED: "role_switched",
    DEVICE_REGISTERED: "device_registered",
    DEVICE_REMOVED: "device_removed",
};
exports.AUTH_QUEUE_EVENTS = {
    USER_REGISTERED: "USER_REGISTERED",
    EMAIL_JOBS: "email_jobs",
};
