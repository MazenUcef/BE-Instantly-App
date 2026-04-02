type Slot = {
  start: string;
  end: string;
};

export const parseTimeToMinutes = (time: string) => {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
};

export const minutesToTime = (minutes: number) => {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
};

export const generateSlots = (
  startTime: string,
  endTime: string,
  slotDurationMinutes: number,
  breakStart?: string,
  breakEnd?: string,
): Slot[] => {
  const start = parseTimeToMinutes(startTime);
  const end = parseTimeToMinutes(endTime);
  const breakStartMin = breakStart ? parseTimeToMinutes(breakStart) : null;
  const breakEndMin = breakEnd ? parseTimeToMinutes(breakEnd) : null;

  const slots: Slot[] = [];

  for (let cursor = start; cursor + slotDurationMinutes <= end; cursor += slotDurationMinutes) {
    const slotStart = cursor;
    const slotEnd = cursor + slotDurationMinutes;

    const overlapsBreak =
      breakStartMin !== null &&
      breakEndMin !== null &&
      slotStart < breakEndMin &&
      slotEnd > breakStartMin;

    if (overlapsBreak) continue;

    slots.push({
      start: minutesToTime(slotStart),
      end: minutesToTime(slotEnd),
    });
  }

  return slots;
};

export const overlapsTimeRange = (
  slotStart: string,
  slotEnd: string,
  otherStart: string,
  otherEnd: string,
) => {
  const a1 = parseTimeToMinutes(slotStart);
  const a2 = parseTimeToMinutes(slotEnd);
  const b1 = parseTimeToMinutes(otherStart);
  const b2 = parseTimeToMinutes(otherEnd);

  return a1 < b2 && a2 > b1;
};