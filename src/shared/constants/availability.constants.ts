export const DEFAULT_AVAILABILITY_TIMEZONE = "Africa/Cairo" as const;

export const DEFAULT_SLOT_DURATION_MINUTES = 60 as const;

export const AVAILABILITY_ALLOWED_SLOT_DURATIONS = [15, 30, 45, 60, 90, 120] as const;

export const DEFAULT_WEEKLY_SCHEDULE = [
  { dayOfWeek: 0, isWorking: false, slotDurationMinutes: 60 },
  { dayOfWeek: 1, isWorking: true, startTime: "09:00", endTime: "17:00", slotDurationMinutes: 60 },
  { dayOfWeek: 2, isWorking: true, startTime: "09:00", endTime: "17:00", slotDurationMinutes: 60 },
  { dayOfWeek: 3, isWorking: true, startTime: "09:00", endTime: "17:00", slotDurationMinutes: 60 },
  { dayOfWeek: 4, isWorking: true, startTime: "09:00", endTime: "17:00", slotDurationMinutes: 60 },
  { dayOfWeek: 5, isWorking: true, startTime: "09:00", endTime: "17:00", slotDurationMinutes: 60 },
  { dayOfWeek: 6, isWorking: false, slotDurationMinutes: 60 },
] as const;

export const DEFAULT_ACCEPTED_JOB_DURATION_MINUTES = 120 as const;

export const ACTIVE_BOOKING_STATUSES = ["accepted", "in_progress", "done"] as const;
export const ACTIVE_OFFER_STATUSES_FOR_CALENDAR = ["accepted", "completed"] as const;