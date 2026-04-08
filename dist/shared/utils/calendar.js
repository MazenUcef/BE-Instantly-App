"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.overlapsTimeRange = exports.generateSlots = exports.minutesToTime = exports.parseTimeToMinutes = void 0;
const parseTimeToMinutes = (time) => {
    const [h, m] = time.split(":").map(Number);
    return h * 60 + m;
};
exports.parseTimeToMinutes = parseTimeToMinutes;
const minutesToTime = (minutes) => {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
};
exports.minutesToTime = minutesToTime;
const generateSlots = (startTime, endTime, slotDurationMinutes, breakStart, breakEnd) => {
    const start = (0, exports.parseTimeToMinutes)(startTime);
    const end = (0, exports.parseTimeToMinutes)(endTime);
    const breakStartMin = breakStart ? (0, exports.parseTimeToMinutes)(breakStart) : null;
    const breakEndMin = breakEnd ? (0, exports.parseTimeToMinutes)(breakEnd) : null;
    const slots = [];
    for (let cursor = start; cursor + slotDurationMinutes <= end; cursor += slotDurationMinutes) {
        const slotStart = cursor;
        const slotEnd = cursor + slotDurationMinutes;
        const overlapsBreak = breakStartMin !== null &&
            breakEndMin !== null &&
            slotStart < breakEndMin &&
            slotEnd > breakStartMin;
        if (overlapsBreak)
            continue;
        slots.push({
            start: (0, exports.minutesToTime)(slotStart),
            end: (0, exports.minutesToTime)(slotEnd),
        });
    }
    return slots;
};
exports.generateSlots = generateSlots;
const overlapsTimeRange = (slotStart, slotEnd, otherStart, otherEnd) => {
    const a1 = (0, exports.parseTimeToMinutes)(slotStart);
    const a2 = (0, exports.parseTimeToMinutes)(slotEnd);
    const b1 = (0, exports.parseTimeToMinutes)(otherStart);
    const b2 = (0, exports.parseTimeToMinutes)(otherEnd);
    return a1 < b2 && a2 > b1;
};
exports.overlapsTimeRange = overlapsTimeRange;
