/** Small, dependency-free date helpers. All dates are local calendar dates. */

export const DATE_PATTERN = "YYYY-MM-DD";
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DATETIME_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

/** `YYYY-MM-DD` for a Date, in local time. */
export function toDateKey(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** `YYYY-MM-DDTHH:MM` for a Date, in local time. */
export function toDateTimeKey(date: Date = new Date()): string {
  const h = String(date.getHours()).padStart(2, "0");
  const min = String(date.getMinutes()).padStart(2, "0");
  return `${toDateKey(date)}T${h}:${min}`;
}

export function todayKey(): string {
  return toDateKey(new Date());
}

export function isDateKey(value: string): boolean {
  if (!DATE_RE.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number) as [number, number, number];
  const date = new Date(y, m - 1, d);
  return (
    date.getFullYear() === y &&
    date.getMonth() === m - 1 &&
    date.getDate() === d
  );
}

export function isDateTimeKey(value: string): boolean {
  if (!DATETIME_RE.test(value)) return false;
  return isDateKey(value.slice(0, 10));
}

/** Parse `YYYY-MM-DD` into a local Date at midnight. */
export function parseDateKey(value: string): Date {
  const [y, m, d] = value.split("-").map(Number) as [number, number, number];
  return new Date(y, m - 1, d);
}

/** Parse `YYYY-MM-DDTHH:MM` into a local Date. */
export function parseDateTimeKey(value: string): Date {
  const date = value.slice(0, 10);
  const time = value.slice(11, 16);
  const [h, min] = time.split(":").map(Number) as [number, number];
  const base = parseDateKey(date);
  base.setHours(h, min, 0, 0);
  return base;
}

export function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

export function addMonths(date: Date, months: number): Date {
  const next = new Date(date.getFullYear(), date.getMonth() + months, 1);
  const lastDay = new Date(
    next.getFullYear(),
    next.getMonth() + 1,
    0,
  ).getDate();
  next.setDate(Math.min(date.getDate(), lastDay));
  return next;
}

export function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

export function endOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0);
}

export function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/** `Mon`, `Tue`, … */
export const WEEKDAY_LABELS = [
  "Mon",
  "Tue",
  "Wed",
  "Thu",
  "Fri",
  "Sat",
  "Sun",
] as const;

/** Full 6x7 grid of days covering the month, Monday-first. */
export function monthGrid(view: Date): Date[] {
  const first = startOfMonth(view);
  const lead = (first.getDay() + 6) % 7;
  const start = addDays(first, -lead);
  return Array.from({ length: 42 }, (_, i) => addDays(start, i));
}

export function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

/** `2026-09-28T14:30` -> `14:30`. */
export function formatTime(value: string): string {
  return value.length >= 16 ? value.slice(11, 16) : value;
}

/** `2026-09-28` -> `28 Sep`. */
export function formatDayShort(value: string): string {
  const date = parseDateKey(value.slice(0, 10));
  return `${date.getDate()} ${date.toLocaleDateString(undefined, { month: "short" })}`;
}

/** `2026-09-28` -> `Mon 28 Sep`. */
export function formatDayLong(value: string): string {
  const date = parseDateKey(value.slice(0, 10));
  return `${WEEKDAY_LABELS[(date.getDay() + 6) % 7]} ${date.getDate()} ${date.toLocaleDateString(undefined, { month: "short" })}`;
}

/** Relative label for a due date: `Today`, `Tomorrow`, `3d overdue`, `Mon 5 Oct`. */
export function relativeDay(
  value: string,
  reference: Date = new Date(),
): string {
  const key = toDateKey(reference);
  const target = value.slice(0, 10);
  const days = Math.round(
    (parseDateKey(target).getTime() - parseDateKey(key).getTime()) / 86_400_000,
  );
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  if (days === -1) return "Yesterday";
  if (days < 0) return `${Math.abs(days)}d overdue`;
  if (days <= 6)
    return WEEKDAY_LABELS[(parseDateKey(target).getDay() + 6) % 7]!;
  return formatDayShort(target);
}

/** `1500` -> `25:00`. */
export function formatClock(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

/** `4500` -> `1h 15m`. */
export function formatDuration(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

/** RFC 3339 instant -> local `HH:MM`. */
export function formatInstant(instant: string): string {
  const date = new Date(instant);
  if (Number.isNaN(date.getTime())) return "";
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

export function nowInstant(): string {
  return new Date().toISOString();
}
