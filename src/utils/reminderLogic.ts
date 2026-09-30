/**
 * Event reminder decisions.
 *
 * `due_event_reminders` already narrows the database down to events whose fire
 * moment has passed. What is left for the frontend is deciding what to actually
 * show, which is kept here as pure functions so it can be tested without a
 * clock, a database or a notification service.
 */
import { parseDateTimeKey } from "./date";

/** The fields a reminder decision needs from a calendar event. */
export interface ReminderEvent {
  id: string;
  title: string;
  startTime: string;
  notifiedAt: string | null;
}

/**
 * Whole minutes from `now` until the event starts, never negative.
 *
 * Rounded up rather than down so a reminder that fires 30 seconds early says
 * "1 min" instead of "0 min", which `eventSoon` renders as "Starting now".
 */
export function minutesUntil(startTime: string, now: Date): number {
  const start = parseDateTimeKey(startTime);
  if (Number.isNaN(start.getTime())) return 0;
  return Math.max(0, Math.ceil((start.getTime() - now.getTime()) / 60_000));
}

/**
 * The events still worth notifying, soonest first.
 *
 * The backend filters by fire moment, but `markNotified` only lands after the
 * notification is delivered. Two guards matter here: already-notified rows are
 * dropped so a slow sweep cannot show the same reminder twice, and an event
 * that has already started is dropped so a delayed sweep stays quiet rather
 * than announcing something already in progress.
 */
export function pendingReminders(
  events: ReminderEvent[],
  now: Date,
): ReminderEvent[] {
  return events
    .filter((event) => event.notifiedAt === null)
    .filter((event) => {
      const start = parseDateTimeKey(event.startTime).getTime();
      return !Number.isNaN(start) && start > now.getTime();
    })
    .sort(
      (a, b) =>
        parseDateTimeKey(a.startTime).getTime() -
        parseDateTimeKey(b.startTime).getTime(),
    );
}
