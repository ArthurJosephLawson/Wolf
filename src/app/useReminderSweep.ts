import { useEffect } from "react";
import { minutesUntil, pendingReminders } from "../lib/reminderLogic";
import { calendarService } from "../services/calendar";
import { isDesktop } from "../services/ipc";
import { MESSAGES, notify } from "../services/notify";
import type { Settings } from "../types";

/** How often the reminder sweep runs. */
const REMINDER_INTERVAL_MS = 30_000;

export function useReminderSweep(settings: Settings): void {
  // Event reminders. The backend already filters on its own setting; the sweep
  // is gated here as well so a disabled toggle costs no polling at all.
  useEffect(() => {
    if (!isDesktop) return;
    if (!settings.eventRemindersEnabled || !settings.notificationsEnabled)
      return;

    let cancelled = false;
    // Delivery is awaited before the row is marked, so a slow notification
    // service must not let the next tick start a second sweep on the same rows.
    let inFlight = false;

    const sweep = async () => {
      if (inFlight) return;
      inFlight = true;
      try {
        const due = await calendarService.dueReminders();
        if (cancelled) return;
        for (const event of pendingReminders(due, new Date())) {
          const minutes = minutesUntil(event.startTime, new Date());
          await notify(MESSAGES.eventSoon(event.title, minutes));
          if (cancelled) return;
          await calendarService.markNotified(event.id);
        }
      } catch {
        // Reminders are best-effort: a refused notification must not stop the
        // app or stop the next sweep.
      } finally {
        inFlight = false;
      }
    };

    void sweep();
    const id = window.setInterval(() => void sweep(), REMINDER_INTERVAL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [settings.eventRemindersEnabled, settings.notificationsEnabled]);
}
