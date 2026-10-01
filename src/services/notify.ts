/**
 * Local desktop notifications.
 *
 * Delivery is best-effort: if the freedesktop notification service is missing
 * or refuses the request, the caller receives a readable reason and the UI
 * carries on. Notifications are never a hard dependency.
 */
import { invoke } from "./ipc";
import { toAppError } from "../lib/errors";
export interface LocalNotification {
  summary: string;
  body: string;
  urgent?: boolean;
}

export class NotificationsUnavailableError extends Error {
  readonly reason: string;

  constructor(reason: string) {
    super(reason);
    this.name = "NotificationsUnavailableError";
    this.reason = reason;
  }
}

/** Fire a notification. Throws {@link NotificationsUnavailableError} on refusal. */
export async function notify({
  summary,
  body,
  urgent,
}: LocalNotification): Promise<void> {
  try {
    await invoke<void>("send_notification", {
      summary,
      body,
      urgent: urgent ?? false,
    });
  } catch (error) {
    const appError = toAppError(error, "Wolf could not show a notification.");
    throw new NotificationsUnavailableError(appError.message);
  }
}

/** Fire and forget; returns false when the desktop refused. */
export async function notifyQuiet(
  notification: LocalNotification,
): Promise<boolean> {
  try {
    await notify(notification);
    return true;
  } catch {
    return false;
  }
}

export async function notificationsAvailable(): Promise<boolean> {
  try {
    return await invoke<boolean>("notifications_available");
  } catch {
    return false;
  }
}

/** Wolf's own notification copy, kept in one place for consistency. */
export const MESSAGES = {
  focusComplete(minutes: number): LocalNotification {
    return {
      summary: "Focus session complete",
      body: `${minutes} minutes done. Take a short break — Wolf is celebrating.`,
    };
  },
  breakComplete(): LocalNotification {
    return {
      summary: "Break over",
      body: "Back to it. Wolf is ready when you are.",
    };
  },
  habitDue(name: string): LocalNotification {
    return { summary: "Habit reminder", body: `Time for ${name}.` };
  },
  eventSoon(title: string, minutes: number): LocalNotification {
    return {
      summary: minutes > 0 ? `Starts in ${minutes} min` : "Starting now",
      body: title,
      urgent: minutes <= 5,
    };
  },
  taskOverdue(title: string): LocalNotification {
    return { summary: "Task overdue", body: title, urgent: true };
  },
  ollamaOffline(): LocalNotification {
    return {
      summary: "Ollama is not running",
      body: "The assistant is unavailable. Everything else works offline.",
    };
  },
};
