"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ACTIVE_OFFER_STATUSES_FOR_CALENDAR = exports.ACTIVE_BOOKING_STATUSES = exports.DEFAULT_ACCEPTED_JOB_DURATION_MINUTES = exports.DEFAULT_WEEKLY_SCHEDULE = exports.AVAILABILITY_ALLOWED_SLOT_DURATIONS = exports.DEFAULT_SLOT_DURATION_MINUTES = exports.DEFAULT_AVAILABILITY_TIMEZONE = void 0;
exports.DEFAULT_AVAILABILITY_TIMEZONE = "Africa/Cairo";
exports.DEFAULT_SLOT_DURATION_MINUTES = 60;
exports.AVAILABILITY_ALLOWED_SLOT_DURATIONS = [15, 30, 45, 60, 90, 120];
exports.DEFAULT_WEEKLY_SCHEDULE = [
    { dayOfWeek: 0, isWorking: false, slotDurationMinutes: 60 },
    { dayOfWeek: 1, isWorking: true, startTime: "09:00", endTime: "17:00", slotDurationMinutes: 60 },
    { dayOfWeek: 2, isWorking: true, startTime: "09:00", endTime: "17:00", slotDurationMinutes: 60 },
    { dayOfWeek: 3, isWorking: true, startTime: "09:00", endTime: "17:00", slotDurationMinutes: 60 },
    { dayOfWeek: 4, isWorking: true, startTime: "09:00", endTime: "17:00", slotDurationMinutes: 60 },
    { dayOfWeek: 5, isWorking: true, startTime: "09:00", endTime: "17:00", slotDurationMinutes: 60 },
    { dayOfWeek: 6, isWorking: false, slotDurationMinutes: 60 },
];
exports.DEFAULT_ACCEPTED_JOB_DURATION_MINUTES = 120;
exports.ACTIVE_BOOKING_STATUSES = ["accepted", "in_progress", "done"];
exports.ACTIVE_OFFER_STATUSES_FOR_CALENDAR = ["accepted", "completed"];
