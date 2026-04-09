export interface TimeWindow {
  start: Date;
  durationMinutes: number;
  referenceId?: string;
}

export function findTimeConflict(
  existingWindows: TimeWindow[],
  newStart: Date,
  newDurationMinutes: number,
): TimeWindow | null {
  const newEnd = new Date(newStart.getTime() + newDurationMinutes * 60_000);

  for (const w of existingWindows) {
    const wEnd = new Date(w.start.getTime() + w.durationMinutes * 60_000);
    if (newStart < wEnd && newEnd > w.start) {
      return w;
    }
  }

  return null;
}
